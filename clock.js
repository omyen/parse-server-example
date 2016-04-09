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

	//show it to the causing user's friends
	var relation = post.get('causingUser').relation('friends');
	var query = relation.query();

	return query.find().then(function(results){
		results.forEach(function(friend){
			toSave.push(friend);
			friend.relation('posts').add(post);
		});

		//show it to all the owners of the about pet
		if(post.get('aboutPet')){
			relation = post.get('aboutPet').relation('owners');
			query = relation.query();
			return query.find();
		} else {
			return Parse.Object.saveAll(toSave);
		}
	}).then(function(results){
		results.forEach(function(owner){
			toSave.push(owner);
			owner.relation('posts').add(post);
		});

		return Parse.Object.saveAll(toSave);
	});
	
}

function publishFedPet(post, queueItem){
	log.info('[publishFedPet] Info=\'Processing object\'');
	log.debug('[publishFedPet] queueItem=%j', queueItem)
	return Parse.Promise.error('no');
	try{
		post.set('type', 'fedPet');
		post.set('title', queueItem.get('causingUser').get('displayName') + ' fed ' + queueItem.get('aboutPet').get('name'));
		post.set('image', queueItem.get('aboutPet').get('profilePhoto'));
	} catch (e){
		log.debug('[publishFedPet] Info=\'Failed to set post properties\'');
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

	post.set('type', 'newPetPhoto');
	post.set('title', queueItem.get('causingUser').get('displayName') + ' added a new photo of ' + queueItem.get('aboutPet').get('name'));
	post.set('image', queueItem.get('photo'));

	return post.save().then(function(post){
		log.debug('[publishNewPetPhoto] Info=\'Saved post\'');
		return propagatePost(post);
	});

}


function processPublishQueue(){
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
			console.log('[processPublishQueue] Info=\'Processing post\' type=' + queueItem.get('type'));

			var Post = Parse.Object.extend('Post');
			var post = new Post();
			post.set('numberPats', 0);
			post.set('causingUser', queueItem.get('causingUser'));
			post.set('aboutPet', queueItem.get('aboutPet'));

			switch(queueItem.get('type')){
				case 'newPetPhoto':
					//if success, destroy the item
					publishNewPetPhoto(post, queueItem).then(function(results){
						queueItem.destroy();
					}, function(error){
						log.error('[processPublishQueue] Info=\'failed processing publishNewPetPhoto\' error=' + error.message);
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


//======================
//set up cron job
var CronJob = require('cron').CronJob;
new CronJob({
  cronTime: "15 * * * * *",//15 seconds after every minute
  onTick: processPublishQueue,
  start: true,
  timeZone: "America/Los_Angeles"
});