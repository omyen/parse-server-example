//require('log-buffer');
var log = require('loglevel');

log.setLevel('debug');

var Parse = require('parse/node');
Parse.initialize(process.env.APP_ID, '', process.env.MASTER_KEY); //middle var is js key - null
Parse.serverURL = process.env.SERVER_URL;

Parse.Cloud.useMasterKey();

var RETRIES = 2;

function propagatePost(post){
	var toSave = [post.get('causingUser')]; //always show it to the person who caused it
	post.get('causingUser').relation('posts').add(post);

	try{
		//show it to the causing user's friends
		var relation = post.get('causingUser').relation('friends');
		var query = relation.query();
	} catch (e){
		log.error('[propagatePost] Info=\'Failed to get friends relation\' error=' + e.message);
		return Parse.Promise.error(e);
	}

	return query.find().then(function(results){
		results.forEach(function(friend){
			try{
				toSave.push(friend);
				friend.relation('posts').add(post);
			} catch (e){
				log.error('[propagatePost] Info=\'Failed to send to friends\' error=' + e.message);
				return Parse.Promise.error(e);
			}
		});

		//show it to all the owners of the about pet
		if(post.get('aboutPet')){
			try{
				relation = post.get('aboutPet').relation('owners');
				query = relation.query();
			} catch (e){
				log.error('[propagatePost] Info=\'Failed to get owners relation\' error=' + e.message);
				return Parse.Promise.error(e);
			}
			return query.find();
		} else {
			return Parse.Object.saveAll(toSave);
		}
	}).then(function(results){
		results.forEach(function(owner){
			try{
				toSave.push(owner);
				owner.relation('posts').add(post);
			} catch (e){
				log.error('[propagatePost] Info=\'Failed to send to owners\' error=' + e.message);
				return Parse.Promise.error(e);
			}
		});

		return Parse.Object.saveAll(toSave);
	});
	
}

function publishFedPet(post, queueItem){
	log.info('[publishFedPet] Info=\'Processing object\'');
	log.debug('[publishFedPet] queueItem=%j', queueItem)

	try{
		post.set('type', 'fedPet');
		post.set('title', queueItem.get('causingUser').get('displayName') + ' fed ' + queueItem.get('aboutPet').get('name'));
		post.set('image', queueItem.get('aboutPet').get('profilePhoto'));
	} catch (e){
		log.error('[publishFedPet] Info=\'Failed to set post properties\' error=' + e.message);
		return Parse.Promise.error(e);
	}

	return post.save().then(function(post){
		log.debug('[publishFedPet] Info=\'Saved post\'');
		return propagatePost(post);
	});

}


function publishNewPetPhoto(post, queueItem){
	log.info('[publishNewPetPhoto] Info=\'Processing object\'');
	log.debug('[publishNewPetPhoto] queueItem=%j', queueItem)

	try{
		post.set('type', 'newPetPhoto');
		post.set('title', queueItem.get('causingUser').get('displayName') + ' added a new photo of ' + queueItem.get('aboutPet').get('name'));
		post.set('image', queueItem.get('photo'));	
	} catch (e){
		log.error('[publishNewPetPhoto] Info=\'Failed to set post properties\' error=' + e.message);
		return Parse.Promise.error(e);
	}

	return post.save().then(function(post){
		log.debug('[publishNewPetPhoto] Info=\'Saved post\'');
		return propagatePost(post);
	});

}

function publishNewPet(post, queueItem){
	log.info('[publishNewPet] Info=\'Processing object\'');
	log.debug('[publishNewPet] queueItem=%j', queueItem)

	try{
		post.set('type', 'newPet');
		post.set('title', queueItem.get('causingUser').get('displayName') + ' added a new pet called ' + queueItem.get('aboutPet').get('name'));	
	} catch (e){
		log.error('[publishNewPet] Info=\'Failed to set post properties\' error=' + e.message);
		return Parse.Promise.error(e);
	}

	return post.save().then(function(post){
		log.debug('[publishNewPet] Info=\'Saved post\'');
		return propagatePost(post);
	});

}


function processPublishQueue(){
	log.info('[processPublishQueue] Info=\'Running\'');

	var query = new Parse.Query('PublishQueue');
	query.include('savedObject');
	query.include('causingUser');
	query.include('aboutPet');
	query.include('photo');

	query.find().then(function(publishQueue){
		publishQueue.forEach(function(queueItem){
			if(queueItem.get('retries') == null){
				queueItem.set('retries', 0);
				queueItem.save();
			}else if(queueItem.get('retries')>RETRIES){
				queueItem.destroy();
			} else {
				queueItem.increment('retries');
				queueItem.save();
			}
			log.info('[processPublishQueue] Info=\'Processing post\' type=' + queueItem.get('type') + 'retries=' + queueItem.get('retries'));

			try{
				var Post = Parse.Object.extend('Post');
				var post = new Post();
				post.set('numberPats', 0);
				post.set('causingUser', queueItem.get('causingUser'));
				post.set('aboutPet', queueItem.get('aboutPet'));
			} catch (e){
				log.error('[processPublishQueue] Info=\'Failed to set post properties\' error=' + e.message);
				return; //try next queue item
			}

			switch(queueItem.get('type')){
				case 'newPetPhoto':
					//if success, destroy the item
					publishNewPetPhoto(post, queueItem).then(function(results){
						queueItem.destroy();
					}, function(error){
						log.error('[processPublishQueue] Info=\'failed processing publishNewPetPhoto\' error=' + error.message);
					});
					break;
				case 'newPet':
					//if success, destroy the item
					publishNewPet(post, queueItem).then(function(results){
						queueItem.destroy();
					}, function(error){
						log.error('[processPublishQueue] Info=\'failed processing publishNewPet\' error=' + error.message);
					});
					break;
				case 'fedPet':
					//if success, destroy the item
					publishFedPet(post, queueItem).then(function(results){
						queueItem.destroy();
					}, function(error){
						log.error('[processPublishQueue] Info=\'failed processing publishFedPet\' error=' + error.message);
					});
					break;
				default:
					log.warn('[processPublishQueue] Info=\'Unknown post type\' type=' + queueItem.get('type'));
					break;
			}
		});
	});
}

function resetXPDailies(){
	log.info('[resetXPDailies] Info=\'Running\'');

	var query = new Parse.Query('Pet');

	var toSave = [];

	query.find().then(function(pets){
		for (var i = 0; i < pets.length; ++i) {
			try{
				log.debug('[resetXPDailies] Info=\'Resetting dailies for pet\' pet=' + pets[i].get('name'));
				pets[i].set('numberPhotosAddedToday', 0);
				pets[i].set('numberFeedsToday', 0);
				toSave.push(pets[i]);
			} catch(e){
				log.error('[resetXPDailies] Info=\'Failed to reset dailies for pet\' error=' + e.message);
				continue;
			}
		}
	}, function(error){
		log.error('[resetXPDailies] Info=\'Couldn\'t retrieve pets to reset dailies\' error=' + error.message);
	});

	log.debug('[resetXPDailies] Info=\'Saving pets\' toSave.length=' + toSave.length);
	Parse.Object.saveAll(toSave);
}

//======================
//set up cron job
var CronJob = require('cron').CronJob;

new CronJob({
  cronTime: "15 * * * * *",//15 seconds after every minute
  onTick: processPublishQueue,
  start: true,
  timeZone: "America/Los_Angeles"
});

new CronJob({
  cronTime: "15 * * * * *",//15 seconds after every minute
  onTick: resetXPDailies,
  start: true,
  timeZone: "America/Los_Angeles"
});