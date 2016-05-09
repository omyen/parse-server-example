//require('log-buffer');
var log = require('loglevel');

log.setLevel('debug');

var Parse = require('parse/node');
Parse.initialize(process.env.APP_ID, '', process.env.MASTER_KEY); //middle var is js key - null
Parse.serverURL = process.env.SERVER_URL;

Parse.Cloud.useMasterKey();

var RETRIES = 2;

function propagateAd(post){
	var toSave = [];

	var query = new Parse.Query("_User");

	return query.find().then(function(results){
		results.forEach(function(user){
			try{
				toSave.push(user);
				user.relation('posts').add(post);
			} catch (e){
				log.error('[propagateAd] Info=\'Failed to send to user\' error=' + e.message);
				return Parse.Promise.error(e);
			}
		});

		return Parse.Object.saveAll(toSave);
	});
	
}

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
		post.set('title', queueItem.get('causingUser').get('displayName') + ' added a photo of ' + queueItem.get('aboutPet').get('name'));
		post.set('image', queueItem.get('photo'));	
	} catch (e){
		log.error('[publishNewPetPhoto] Info=\'Failed to set post properties\' error=' + e.message);
		return Parse.Promise.error(e);
	}

	return post.save().then(function(post){
		log.debug('[publishNewPetPhoto] Info=\'Saved post\'');
		//also save the post as a field in the photo so we can link the pats/likes
		try{
			queueItem.get('photo').set('relatedPost', post);
			queueItem.get('photo').save().then(function(photo){
				log.debug('[publishNewPetPhoto] Info=\'Saved photo\'');
			}, function(error){
				log.error('[publishNewPetPhoto] Info=\'Failed to save photo\' error=' + error.message);
			});
		} catch(e){
			log.error('[publishNewPetPhoto] Info=\'Failed to set relatedPost on photo\' error=' + e.message);
		}

		return propagatePost(post);
	});

}

function publishLevelUp(post, queueItem){
	log.info('[publishLevelUp] Info=\'Processing object\'');
	log.debug('[publishLevelUp] queueItem=%j', queueItem)

	try{
		post.set('type', 'levelUp');
		post.set('title', queueItem.get('aboutPet').get('name') + ' is now level ' + queueItem.get('newLevel'));
		post.set('image', queueItem.get('aboutPet').get('profilePhoto'));
	} catch (e){
		log.error('[publishLevelUp] Info=\'Failed to set post properties\' error=' + e.message);
		return Parse.Promise.error(e);
	}

	return post.save().then(function(post){
		log.debug('[publishLevelUp] Info=\'Saved post\'');
		return propagatePost(post);
	});

}

function publishNewPet(post, queueItem){
	log.info('[publishNewPet] Info=\'Processing object\'');
	log.debug('[publishNewPet] queueItem=%j', queueItem)

	try{
		post.set('type', 'newPet');
		post.set('title', queueItem.get('causingUser').get('displayName') + ' added a pet ' + queueItem.get('aboutPet').get('name'));	
	} catch (e){
		log.error('[publishNewPet] Info=\'Failed to set post properties\' error=' + e.message);
		return Parse.Promise.error(e);
	}

	return post.save().then(function(post){
		log.debug('[publishNewPet] Info=\'Saved post\'');
		return propagatePost(post);
	});

}



function publishAd(post, queueItem){
	log.info('[publishAd] Info=\'Processing object\'');
	log.debug('[publishAd] queueItem=%j', queueItem)

	try{
		post.set('type', 'ad');
		post.set('title', queueItem.get('title'));	
		post.set('image', queueItem.get('photo'));	
		post.set('url', queueItem.get('url'));	
	} catch (e){
		log.error('[publishAd] Info=\'Failed to set post properties\' error=' + e.message);
		return Parse.Promise.error(e);
	}

	return post.save().then(function(post){
		log.debug('[publishAd] Info=\'Saved post\'');
		return propagateAd(post);
	});

}

function processQueueItem(queueItem){
	try{
		var Post = Parse.Object.extend('Post');
		var post = new Post();
		post.set('numberPats', 0);
		post.set('causingUser', queueItem.get('causingUser'));
		post.set('aboutPet', queueItem.get('aboutPet'));
		var now = new Date();
		var daysSinceEpoch =  Math.floor(now/86400000);
		post.set('creationDay', daysSinceEpoch);

	} catch (e){
		log.error('[processQueueItem] Info=\'Failed to set post properties\' error=' + e.message);
		return; //try next queue item
	}

	switch(queueItem.get('type')){
		case 'newPetPhoto':
			//if success, destroy the item
			publishNewPetPhoto(post, queueItem).then(function(results){
				queueItem.destroy();
			}, function(error){
				log.error('[processQueueItem] Info=\'failed processing publishNewPetPhoto\' error=' + error.message);
			});
			break;
		case 'newPet':
			//if success, destroy the item
			publishNewPet(post, queueItem).then(function(results){
				queueItem.destroy();
			}, function(error){
				log.error('[processQueueItem] Info=\'failed processing publishNewPet\' error=' + error.message);
			});
			break;
		case 'fedPet':
			//if success, destroy the item
			publishFedPet(post, queueItem).then(function(results){
				queueItem.destroy();
			}, function(error){
				log.error('[processQueueItem] Info=\'failed processing publishFedPet\' error=' + error.message);
			});
			break;
		case 'levelUp':
			//if success, destroy the item
			publishLevelUp(post, queueItem).then(function(results){
				queueItem.destroy();
			}, function(error){
				log.error('[processQueueItem] Info=\'failed processing levelUp\' error=' + error.message);
			});
			break;
		case 'ad':
			//if success, destroy the item
			publishAd(post, queueItem).then(function(results){
				queueItem.destroy();
			}, function(error){
				log.error('[processQueueItem] Info=\'failed processing publishAd\' error=' + error.message);
			});
			break;
		default:
			log.warn('[processQueueItem] Info=\'Unknown post type\' type=' + queueItem.get('type'));
			break;
	}
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
			processQueueItem(queueItem);

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
		log.debug('[resetXPDailies] Info=\'Saving pets\' toSave.length=' + toSave.length);
		Parse.Object.saveAll(toSave);
	}, function(error){
		log.error('[resetXPDailies] Info=\'Couldn\'t retrieve pets to reset dailies\' error=' + error.message);
	});

	
}

function sendPushes(users, initiatingUser, type, extraData){
	try{
		log.debug('[sendPushes] type=' + type);
		//make an array of ids
		var ids = [];
		for (var i = 0; i < users.length; ++i) {
			if(users[i].id != initiatingUser.id){
				ids.push(users[i].id)
			}
		}

		var alert;
		var details = {};
		switch(type){
			case 'feedingReminder':
				alert = extraData.get('name') + ' hasn\'t been fed yet';
				details.pet = extraData;
				break;
			default:
				return;
		}

		//send a full notification to all users who want it
		var query = new Parse.Query(Parse.Installation);
		query.containedIn('user', ids);
		query.equalTo('sendNotifications', true);

		Parse.Push.send({
		  where: query,
		  data: {
		  	title: 'DoubleDip',
		    alert: alert,
		    type: type,
		    details: details
		  }
		}, {
		  success: function() {
		    log.debug('##### PUSH OK');
		  },
		  error: function(error) {
		    log.debug('##### PUSH ERROR');
		  },
		  useMasterKey: true
		});
	} catch (e){
		log.error('[sendPushes] Info=\'Failed\' error=' + e.message);
	}
} 

function sendFeedReminders(){
	log.info('[sendFeedReminders] Info=\'Running\'');
	var now = new Date();
	var utcHours = now.getUTCHours();
	var utcMinutes = now.getUTCMinutes();
	var utcTimeMinutes = utcMinutes + 60*utcHours;
	var utcTimeMinutesMin = (utcTimeMinutes-7)%1440;
	var utcTimeMinutesMax = (utcTimeMinutes+8)%1440;

	var FeedingReminder = Parse.Object.extend('FeedingReminder');
	var query = new Parse.Query(FeedingReminder);
	if(utcTimeMinutesMin<utcTimeMinutesMax){
		query.lessThan('minutes', utcTimeMinutesMax);
		query.greaterThan('minutes', utcTimeMinutesMin);
	} else {
		//must be across midnight
		var queryLess = new Parse.Query(FeedingReminder);
		var queryMore = new Parse.Query(FeedingReminder);
		queryLess.lessThan('minutes', utcTimeMinutesMax);
		queryMore.greaterThan('minutes', utcTimeMinutesMin);
		query = Parse.Query.or(queryLess, queryMore);
	}

	query.find().then(function(feedingReminders){
		log.info('[sendFeedReminders] Info=\'Got feedingReminders\' length=' + feedingReminders.length);
		for(var i = 0; i<feedingReminders.length; i++){
			var queryOwners = feedingReminders[i].get('pet').relation('owners').query();
			queryOwners.find().then(function(owners){
				var dummy = {};
				sendPushes(owners, dummy, 'feedingReminder', feedingReminders[i].get('pet'));
			}
		}
	}
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
  cronTime: "0 */15 * * * *",//every 15 minutes
  onTick: sendFeedReminders,
  start: true,
  timeZone: "America/Los_Angeles"
});


new CronJob({
  cronTime: "15 1 0 * * *",//15 seconds after minute one of hour 0 of every day
  onTick: resetXPDailies,
  start: true,
  timeZone: "America/Los_Angeles"
});