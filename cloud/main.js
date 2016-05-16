//require('log-buffer');
var express = require('express');
var crypto = require('crypto');
var log = require('loglevel');
var moment = require('moment-timezone');

log.setLevel('debug');

var NEW_PHOTOS_PER_DAY = 1; //max number of new photos that will give xp per day
var NEW_FEEDS_PER_DAY = 2; //max number of feeds that will give xp per day
var FED_POSTS_PER_PET_PER_DAY = 1; //max posts generated by feeding a pet each day
var NEW_PHOTO_POSTS_PER_PET_PER_DAY = 1;

//==============================
//helper functions
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
			case 'fedPet':
				alert = 'Someone fed one of your pets';
				details.pet = extraData;
				details.goToState = 'tabs.pets_pets'
				break;
			case 'newFriend':
				alert = 'You have a new friend';
				details.friend = extraData;
				details.goToState = 'tabs.friends_friends'
				break;
			case 'newFriendRequest':
				alert = 'You have a new friend request';
				details.friendRequest = extraData;
				details.goToState = 'tabs.friends_friends'
				break;
			case 'newPost':
				alert = 'You have new posts';
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

		//now send a simple push to those who don't 
		query = new Parse.Query(Parse.Installation);
		query.containedIn('user', ids);
		query.equalTo('sendNotifications', false);

		Parse.Push.send({
		  where: query,
		  data: {
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

//==============================

//==============================
//beforeSave
Parse.Cloud.beforeSave('_User', function(req, res) 
{
	try{
		var dirtyKeys = req.object.dirtyKeys();
		log.info('[beforeSave User] Info=\'User\' dirtyKeysLength=' + dirtyKeys.length + ' dirtyKeys=' + dirtyKeys);
		for (var i = 0; i < dirtyKeys.length; ++i) {
			if(dirtyKeys[i]=='displayName'){
				req.object.set('displayName_lowercase', req.object.get('displayName').toLowerCase());
			}
		}
	} catch (e){
		log.error('[beforeSave User] Info=\'Failed to set displayname lowercase\' error=' + e.message);
	}
	//either way, return success to the user
	res.success();
	//can't save any other objects in before save so add a lastDirtykeys for aftersave to look at
});



Parse.Cloud.beforeSave('Post', function(req, res) 
{
	var post = req.object;
	try{
		var dirtyKeys = post.dirtyKeys();
		log.info('[beforeSave Post] Info=\'Post\' dirtyKeysLength=' + dirtyKeys.length + ' dirtyKeys=' + dirtyKeys);
		post.set('lastDirtyKeys', dirtyKeys);
	} catch (e){
		log.error('[beforeSave Post] Info=\'Failed to set dirtyKeys and XP for post\' error=' + e.message);
	}
	//either way, return success to the user
	res.success();
	//can't save any other objects in before save so add a lastDirtykeys for aftersave to look at
});


Parse.Cloud.beforeSave('Pet', function(req, res) 
{
	var pet = req.object;
	//first check to see if it's a brand new pet :3
	if(!pet.existed()){
		try{
			pet.set('numberPhotosAdded', 0);
			pet.set('numberFeeds', 0);
			pet.set('lifetimePats', 0);
			pet.set('maxPatsOnPost', 0);
			pet.set('maxOwners', 1); //you always start with one

			pet.set('levelPhotos', 1);
			pet.set('levelFeeds', 1);
			pet.set('levelMaxPats', 1);
			pet.set('levelLifetimePats', 1);
			pet.set('levelMaxOwners', 1);

			pet.set('numberPhotosAddedToday', 0);
			pet.set('numberFeedsToday', 0);

			pet.set('xp', 0);
			pet.set('level', 1);

			pet.set('coins', 0);
		} catch (e){
			log.error('[beforeSave Pet] Info=\'Failed to set properties for new pet\' error=' + e.message);
		}
		res.success();
		return;
	}

	//todo jump out if only dailes were reset



	try{
		var dirtyKeys = pet.dirtyKeys();
		pet.set('lastDirtyKeys', dirtyKeys);
		if(!dirtyKeys){
			res.success();
			return;
		}
		log.info('[beforeSave Pet] Info=\'Pet\' dirtyKeysLength=' + dirtyKeys.length + ' dirtyKeys=' + dirtyKeys);


		//collect info for XP
		for (var i = 0; i < dirtyKeys.length; ++i) {
			var dirtyKey = dirtyKeys[i];
			switch(dirtyKey){
				case 'profilePhoto':
					log.debug('[beforeSave Pet] Info=\'Pet profilePhoto is dirty - giving XP\'');
					try{
						if(pet.get('numberPhotosAddedToday')<=NEW_PHOTOS_PER_DAY){
							pet.increment('numberPhotosAdded');
							pet.increment('numberPhotosAddedToday');
						} else {
							log.debug('[beforeSave Pet] Info=\'Too many new photos today, no xp\'');
						}
					} catch (e){
						log.error('[beforeSave Pet] Info=\'Failed to set XP for profilePhoto update\' error=' + e.message);
						return; 
					}
					break;

				case 'lastFeedingLog':
					log.debug('[beforeSave Pet] Info=\'Pet lastFeedingLog is dirty - giving XP\'');
					try{
						if(pet.get('numberFeedsToday')<=NEW_FEEDS_PER_DAY){
							pet.increment('numberFeeds');
							pet.increment('numberFeedsToday');
						} else {
							log.debug('[beforeSave Pet] Info=\'Too many feeds today, no xp\'');
						}
					} catch (e){
						log.error('[beforeSave Pet] Info=\'Failed to set XP for feeds update\' error=' + e.message);
						return; 
					}
					break;

				case 'numOwners':
					log.debug('[beforeSave Pet] Info=\'Pet numOwners is dirty - giving XP\'');
					try{
						if(pet.get('numOwners')>pet.get('maxOwners')){
							pet.set('maxOwners', pet.get('numOwners'));
						} else {
							log.debug('[beforeSave Pet] Info=\'max owners unchanged\' numOwners=' + pet.get('numOwners') + ' maxOwners=' + pet.get('maxOwners'));
						}
					} catch (e){
						log.error('[beforeSave Pet] Info=\'Failed to set XP for numOwners update\' error=' + e.message);
						return; 
					}
					break;

				case 'lastPostTotalPats':
					log.debug('[beforeSave Pet] Info=\'Pet lastPostTotalPats is dirty - giving XP\'');
					try{
						if(pet.get('lastPostTotalPats')>pet.get('maxPatsOnPost')){
							pet.set('maxPatsOnPost',pet.get('lastPostTotalPats'));
						} else {
							log.debug('[beforeSave Pet] Info=\'maxPatsOnPost unchanged\' lastPostTotalPats=' + pet.get('lastPostTotalPats') + ' maxPatsOnPost=' + pet.get('maxPatsOnPost'));
						}
					} catch (e){
						log.error('[beforeSave Pet] Info=\'Failed to set XP for lastPostTotalPats update\' error=' + e.message);
						return; 
					}
					break;

				default:
					break;
			}
		}

	} catch (e){
		log.error('[beforeSave Pet] Info=\'Failed to set dirtyKeys and XP for pet\' error=' + e.message);
	}
	//either way, return success to the user
	res.success();
	//can't save any other objects in before save so add a lastDirtykeys for aftersave to look at
});

//==============================

function getXpFromType(pet, xpBar){
	var currentVal = pet.get(xpBar.get('type'));
	var xpPerLevel = xpBar.get('xpGivenPerLevel');
	var level = pet.get(xpBar.get('petLevelField'));
	var numLevels = xpBar.get('pointsPerLevel').length;
	var xp = 0;

	while(currentVal >= xpBar.get('pointsPerLevel')[level]){
		xp = xp + xpPerLevel;
		level++;
		if(level >= numLevels){
			return xp; 
		}
	}

	return xp;
}

function checkPetCanLevelUpAndSendNotifications(pet){
	try{
		var shouldCheck = false;
		var dirtyKeys = pet.get('lastDirtyKeys');

	outerloop:
		for (var i = 0; i < dirtyKeys.length; ++i) {
			var dirtyKey = dirtyKeys[i];
			switch(dirtyKey){
				case 'maxPatsOnPost':
					shouldCheck = true;
					break outerloop;
				case 'lifetimePats':
					shouldCheck = true;
					break outerloop;
				case 'maxOwners':
					shouldCheck = true;
					break outerloop;
				case 'numberPhotosAdded':
					shouldCheck = true;
					break outerloop;
				case 'numberFeeds':
					shouldCheck = true;
					break outerloop;
			}
		}

		if(!shouldCheck){
			log.debug(' [checkPetCanLevelUpAndSendNotifications] Info=\'No xp fields dirty - don\'t need to check\'');
			return;
		}

		var query = new Parse.Query('XpLevel');

		query.find().then(function(results){
			log.debug(' [checkPetCanLevelUpAndSendNotifications] Info=\'Retrieving xp levels succeeded\' numberRetreived=' + results.length);
			var xp = 0;
			var currentXp = pet.get('xp');
			var nextLevelXp;

			for (var i = 0; i < results.length; ++i){
				if(results[i].get('type') == 'xp'){
					nextLevelXp = results[i].get('pointsPerLevel')[pet.get(results[i].get('petLevelField'))];
				} else {
					xp = xp + getXpFromType(pet, results[i])
					log.debug(' [checkPetCanLevelUpAndSendNotifications] Info=\'Got new xp\' xpType=' + results[i].get('type') + ' xp=' + xp);
				}
			}

			if ((xp+currentXp)>=nextLevelXp){
				log.debug(' [checkPetCanLevelUpAndSendNotifications] Info=\'Pet can level up - sending notification\' nextLevelXp=' + nextLevelXp + ' xp=' + xp+currentXp);
			}

		}, function(error){
			log.error(' [checkPetCanLevelUpAndSendNotifications] Info=\'Retrieving xp levels failed\' error=' + error.message);
		});
	} catch (e){
		log.error(' [checkPetCanLevelUpAndSendNotifications] Info=\'error\' error=' + e.message);
	}

}

//==============================
//afterSave
Parse.Cloud.afterSave('Pet', function(req) 
{	
	try{
		//first check to see if it's a brand new pet :3
		if(!req.object.existed()){
			try{
				var PublishQueue = Parse.Object.extend('PublishQueue');
				var queueItem = new PublishQueue;

				queueItem.set('type', 'newPet');
				queueItem.set('req', req);
				queueItem.set('causingUser', req.user);
				queueItem.set('aboutPet', req.object);
				queueItem.save();
			} catch (e){
				log.error('[afterSave Pet] Info=\'Failed to set post properties for new pet\' error=' + e.message);
			}
			return;
		}

		var pet = req.object;
		checkPetCanLevelUpAndSendNotifications(pet);
		//otherwise let's see what changed
	    var dirtyKeys = pet.get('lastDirtyKeys');
	    if(!dirtyKeys) {
	    	log.warn('[afterSave Pet] Info=\'No dirtyKeys\'');
			return; 
	 	} 

		log.info('[afterSave Pet] Info=\'Pet\' dirtyKeysLength=' + dirtyKeys.length + ' pet=' + pet.get('name') + 'petId=' + pet.id);

		var toSave = [];

		//collect info for posts
		for (var i = 0; i < dirtyKeys.length; ++i) {
			var dirtyKey = dirtyKeys[i];
			switch(dirtyKey){
				case 'newPhoto':
					log.debug('[afterSave Pet] Info=\'Pet newPhoto is dirty - queueing post\'');
					//profilePhoto is the latest photo
					try{

						if(pet.get('numberPhotosAddedToday')>NEW_PHOTO_POSTS_PER_PET_PER_DAY){
							log.debug('[afterSave Pet] Info=\'Pet already added too many photos today - not queueing post\'');
							continue;
						} 

						var PublishQueue = Parse.Object.extend('PublishQueue');
						var queueItem = new PublishQueue;

						queueItem.set('type', 'newPetPhoto');
						queueItem.set('req', req);
						queueItem.set('causingUser', req.user); 
						queueItem.set('aboutPet', pet);
						queueItem.set('photo', pet.get('newPhoto'));
						toSave.push(queueItem);
					} catch (e){
						log.error('[afterSave Pet] Info=\'Failed to set post properties for newPhoto update\' error=' + e.message);
						return; 
					}

					break;
				case 'lastFeedingLog':
					log.debug('[afterSave Pet] Info=\'Pet lastFeedingLog is dirty - queueing post\'');
					//we also need to send push notifications to all users who feed this pet
					try{
						var relation = pet.relation('owners');
						var query = relation.query();
					
						query.find().then(function(results){
							log.debug('[afterSave Pet] Info=\'Retrieving owners succeeded\' numberRetreived=' + results.length);
							sendPushes(results, pet.get('lastFeedingUser'), 'fedPet', pet);
						}, function(error){
							log.debug('[afterSave Pet] Info=\'Retrieving owners failed\' error=' + error.message);
							return; 
						});
					} catch (e){
						log.error('[afterSave Pet] Info=\'Failed to send push for lastFeedingLog update\' error=' + e.message);
						return; 
					}

					//publish a post about it
					try{
						if(pet.get('numberFeedsToday')>FED_POSTS_PER_PET_PER_DAY){
							log.debug('[afterSave Pet] Info=\'Pet already fed too many times today - not queueing post\'');
							continue;
						} 


						var PublishQueue = Parse.Object.extend('PublishQueue');
						var queueItem = new PublishQueue;

						queueItem.set('type', 'fedPet');
						queueItem.set('req', req);
						queueItem.set('causingUser', pet.get('lastFeedingUser'));
						queueItem.set('aboutPet', pet);
						toSave.push(queueItem);
					} catch (e){
						log.error('[afterSave Pet] Info=\'Failed to set post properties for lastFeedingLog update\' error=' + e.message);
						return; 
					}



					break;
				case 'level':
					log.debug('[afterSave Pet] Info=\'Pet level is dirty - queueing post\'');
					//profilePhoto is the latest photo
					try{
						var PublishQueue = Parse.Object.extend('PublishQueue');
						var queueItem = new PublishQueue;

						queueItem.set('type', 'levelUp');
						queueItem.set('req', req);
						queueItem.set('causingUser', req.user); 
						queueItem.set('aboutPet', pet);
						queueItem.set('newLevel', pet.get('level'));
						toSave.push(queueItem);
					} catch (e){
						log.error('[afterSave Pet] Info=\'Failed to set post properties for level update\' error=' + e.message);
						return; 
					}
				case 'feedTimes':
					log.debug('[afterSave Pet] Info=\'Pet feedTimes is dirty - reconciling with reminders list\'');
					//get all the feedtimes for this pet
					var feedingRemindersToSave = [];
					var FeedingReminder = Parse.Object.extend('FeedingReminder');
					query = new Parse.Query(FeedingReminder);
					query.equalTo('pet', pet);
					query.find().then(function(feedingReminders){
						//then destroy them all 
						//log.debug('[afterSave Pet] Info=\'Found some feedingReminders - deleting them\' number=' + feedingReminders.length);
						if(feedingReminders.length>0){
							log.debug('[afterSave Pet] Info=\'Found some feedingReminders - deleting them\' number=' + feedingReminders.length);
							return Parse.Object.destroyAll(feedingReminders);
						} else {
							log.debug('[afterSave Pet] Info=\'Found no feedingReminders - proceeding\'');
							return Parse.Promise.as(true);
						}
					}).then(function(result){
						log.debug('[afterSave Pet] Info=\'Adding new feedingReminders\'  number=' +  pet.get('feedTimes').length);
						//then add all the new ones
						for(var i=0; i<pet.get('feedTimes').length; i++){
							log.debug('[afterSave Pet] Info=\'Adding new feedingReminder\'  feedTime=' +  pet.get('feedTimes')[i]);
							var feedingReminder = new FeedingReminder();
							feedingReminder.set('pet', pet);
							var zone = moment.tz.zone(pet.get('timezone')); 
							var offset = zone.parse(new Date());
							feedingReminder.set('offset', offset);
							feedingReminder.set('timezone', pet.get('timezone'));
							var minutes = Math.floor(pet.get('feedTimes')[i]/60);
							var utcMinutes = (minutes + offset + 1440)%1440;
							feedingReminder.set('minutes', utcMinutes);
							feedingRemindersToSave.push(feedingReminder);
						}
						if(pet.get('feedTimes').length>0){
							Parse.Object.saveAll(feedingRemindersToSave);
						}
					}, function(error){
						log.debug('[afterSave Pet] Info=\'Failed adding feedingReminders\'  error=' +  error.message);
					})
					break;
				default:
					break;
			}
		}
		log.debug('[afterSave Pet] Info=\'Saving posts\' toSave.length=' + toSave.length);
		Parse.Object.saveAll(toSave)
	} catch (e){
		log.error('[afterSave Pet] Info=\'Failed\' error=' + e.message);
		return; 
	}
});

Parse.Cloud.afterSave('FriendRequest', function(req) 
{	
	try{
		friendRequest = req.object;
		//first check to see if it's new
		if(!friendRequest.existed()){
			try{
				sendPushes([friendRequest.get('requested')], friendRequest.get('requester'), 'newFriendRequest', friendRequest);
			} catch (e){
				log.error('[afterSave FriendRequest] Info=\'Failed to send push\' error=' + e.message);
			}
			return;
		}
	} catch (e){
		log.error('[afterSave FriendRequest] Info=\'Failed\' error=' + e.message);
		return; 
	}
});

Parse.Cloud.afterSave('Post', function(req) 
{
	Parse.Cloud.useMasterKey();
	var post = req.object;
	var dirtyKeys = post.get('lastDirtyKeys');
    if(!dirtyKeys) {
    	log.error('[afterSave Post] Info=\'No dirtyKeys\'');
		return; 
 	} 

	log.info('[afterSave Post] Info=\'Post\' dirtyKeysLength=' + dirtyKeys.length);
	for (var i = 0; i < dirtyKeys.length; ++i) {
		var dirtyKey = dirtyKeys[i];
		switch(dirtyKey){
			case 'numberPats':
				log.debug('[afterSave Post] Info=\'Post numberPats is dirty - giving xp\'');
				//profilePhoto is the latest photo
				try{
					if(post.get('numberPats')==0){
						continue;
					}
					var pet = post.get('aboutPet');
					pet.set('lastPostTotalPats', post.get('numberPats')); //for stats
					pet.increment('lifetimePats'); //for stats
					pet.save();
				} catch (e){
					log.error('[afterSave Post] Info=\'Failed to give xp for numberPats\' error=' + e.message);
					return; 
				}

				break;
			}
	}

});

// Updates image width and height after save
Parse.Cloud.afterSave("Photo", function(request) {  
	if(request.object.existed()){
		return;
	}

	Parse.Cloud.useMasterKey();
	log.info("[afterSave Photo]");
	try{
	  var imageObject = request.object;
	  var imageFile = imageObject.get('photo');
	  var Image = require("parse-image");
	  Parse.Cloud.httpRequest({url: imageFile.url()}).then(function(response) {
	        // The file contents are in response.buffer.
	        log.debug("[afterSave Photo] got imagefile");
	        var image = new Image();
	        return image.setData(response.buffer);
	    }).then(function(result){
	    	log.debug("[afterSave Photo] set data");
	      	imageObject.set('width', result.width());
	      	//log.debug("[afterSave Photo] set width");
			imageObject.set('height', result.height());
			//log.debug("[afterSave Photo] set height");
			imageObject.set('aspectRatio', result.width()/result.height());
			//log.debug("[afterSave Photo] set aspectRatio");
			return imageObject.save();
	    }).then(function(result){
	    	log.debug("[afterSave Photo] success");
	    }, function(error) {
	      // The networking request failed.
	      log.error("[afterSave Photo] Photo Cannot update image dimensions " + error.code + " : " + error.message);
	    });
	} catch (error){
		log.error("[afterSave Photo] Failed " + error.code + " : " + error.message);
	}
});

//==============================

Parse.Cloud.define('checkInstallationExists', function(request, response) 
{
	Parse.Cloud.useMasterKey();
	var installationQuery = (new Parse.Query(Parse.Installation))
        .equalTo('installationId', request.params.installationId);
    installationQuery.find().then(function(result){
      if(result.length>0){
        response.success(true);
      } else {
      	response.success(false);
      }
    }, function(error){
    	response.error(error.message);
    });
});

Parse.Cloud.define('updatePushChannels', function(request, response) 
{
	try{
		Parse.Cloud.useMasterKey();
		var installationQuery = (new Parse.Query(Parse.Installation))
	        .equalTo('installationId', request.params.installationId);
	    installationQuery.find().then(function(result){
	      if(result.length>0){
	        result[0].set('channels', request.params.channels);
	        return result[0].save();
	      } else {
	      	response.error("Installation id not found - did you forget to initialize the push service?");
	      }
	    }).then(function(result){
	    	response.success(true);
	    }, function(error){
	    	response.error(error.message);
	    });
	} catch (error){
		log.error("[updatePushChannels] Failed " + error.code + " : " + error.message);
		response.error(error.message)
	}
});

Parse.Cloud.define('updatePushUser', function(request, response) 
{
	log.debug("[updatePushUser] Info=\'Running cloud code\'");
	try{
		Parse.Cloud.useMasterKey();
		var installationQuery = (new Parse.Query(Parse.Installation))
	        .equalTo('installationId', request.params.installationId);
	    installationQuery.find().then(function(results){
	      if(results.length>0){
	      	log.debug("[updatePushUser] Info=\'Installation records found\' numberFound" + results.length);
	      	installation = results[0];
	        installation.set('user', request.params.user);
	        return installation.save();
	      } else {
	      	log.error("[updatePushUser] Info=\'Installation records not found\' numberFound" + results.length);
	      	response.error("Installation id not found - did you forget to initialize the push service?");
	      }
	    }).then(function(result){
	    	response.success(true);
	    }, function(error){
	    	response.error(error.message);
	    });
	} catch (error){
		log.error("[updatePushUser] Failed " + error.code + " : " + error.message);
		response.error(error.message)
	}
});

Parse.Cloud.define('updateNotificationPreference', function(request, response) 
{
	try{
		Parse.Cloud.useMasterKey();
		var installationQuery = (new Parse.Query(Parse.Installation))
	        .equalTo('user', request.params.user);
	    installationQuery.find().then(function(results){
	      if(results.length>0){
	      	log.debug("[updateNotificationPreference] Info=\'Installation records found\' numberFound" + results.length);
	      	for(var i=0; i<results.length; ++i){
	      		log.debug("[updateNotificationPreference] Info=\'Setting notifications pref on installation record\' i" + i);
	      		results[i].set('sendNotifications', request.params.sendNotifications);
	      	}
	        return Parse.Object.saveAll(results);
	      } else {
	      	response.error("User not found in installation ids - did you forget to log in a user in the app?");
	      }
	    }).then(function(result){
	    	response.success(true);
	    }, function(error){
	    	response.error(error.message);
	    });
	} catch (error){
		log.error("[updateNotificationPreference] Failed " + error.code + " : " + error.message);
		response.error(error.message)
	}
});

Parse.Cloud.define('checkPassword', function(request, response) 
{
    var password = request.params.password;

    Parse.User.logIn(request.user.getUsername(), password, {
        success: function(results) 
        {   
            response.success(true);
        },
        error: function() {
            response.success(false);
        }
    });
});

Parse.Cloud.define('resetPassword', function(request, response) 
{
	Parse.Cloud.useMasterKey();
	try{
	    var username = request.params.username;

		var queryUsername = new Parse.Query("_User");
		queryUsername.equalTo("username", username);
		queryUsername.include('privateData');

		queryUsername.find().then(function(results){
			if(results.length==0) {
				response.error('username not found');
			}
			return Parse.User.requestPasswordReset(results[0].get('privateData').get('email'));
		}).then(function(result){
			response.success(true);
		}, function(error){
			response.error(error.message);
		});	  
	} catch (e){
		log.error('[resetPassword] Info=\'Error\' error=' + e.message);
		response.error(e.message);
	}
});

Parse.Cloud.define('signUp', function(req, res) {
	//Parse.Cloud.useMasterKey();
	//ok to get password in the clear since we are running over https
	log.info('[signUp] Info=\'Running cloud code\' username=' + req.params.username + ' password=' + req.params.password + ' email=' + req.params.email);

	//first check for a taken username
	try{
	    var username = req.params.username;

		var queryUsername = new Parse.Query("_User");
		queryUsername.equalTo("username", username);

		queryUsername.find().then(function(results){
			if(results.length!=0) {
				res.error('username taken');
			}
		}, function(error){
			res.error(error.message);
		});	  
	} catch (e){
		log.error('[signUp] Info=\'Error\' error=' + e.message);
		res.error(e.message);
		return;
	}

	promises = [];
	//then save the private data, the user, and the initial post

	//email is private data
	var PrivateData = Parse.Object.extend('PrivateData');
	var privateData = new PrivateData();
	privateData.set('email', req.params.email);
	promises.push(privateData.save());

	var User = Parse.Object.extend('_User');
	var user = new User();
	user.set('username', req.params.username);
	user.set('displayName', req.params.username);
	user.set('username_lowercase', req.params.username.toLowerCase()); //for searching
	user.set('displayName_lowercase', req.params.username.toLowerCase()); //for searching
	user.set('password', req.params.password);
	user.set('tagline', 'Human');
	user.set('notifications', true);
	promises.push(user.signUp());

	var Post = Parse.Object.extend('Post');
	var post = new Post();
	post.set('type', 'signUp');
	post.set('title', 'Welcome to Doubledip!');
	post.set('text', 'This is your activity feed, where you\'ll see everything happening on your network. \
		Try adding a new pet in the Pets tab, or find your friends in the Friends tab. If you see a list in the app, you can pull down to refresh it.'
		);
	post.set('numberPats', 0);
	promises.push(post.save());

	Parse.Promise.when(promises).then(
		function(results){
			log.debug('[signup] Info=\'Saved user, privateData, initial post\'');
			//then set some permissions on the user and private data
			user.relation('posts').add(post);
			user.set('privateData', privateData);
			var aclUser = new Parse.ACL();
			aclUser.setPublicReadAccess(true);
			aclUser.setWriteAccess(user, true);
			user.setACL(aclUser);
			promises = [user.save()];

			var aclPrivate = new Parse.ACL();
			aclPrivate.setPublicReadAccess(false);
			aclPrivate.setReadAccess(user, true);
			aclPrivate.setWriteAccess(user, true);
			privateData.setACL(aclPrivate);
			promises.push(privateData.save());

			//then save them both
			return Parse.Promise.when(promises);
		}).then(
		function(results){
			log.debug('[signup] Info=\'Success\'');
			res.success(user);
		}, 
		function(error){
			log.error('[signup] Info=\'Signup failed\' error=' + error.message);
			res.error(error.message);
		});
});

Parse.Cloud.define('deleteFile', function(request, response) 
{
	log.debug('[deleteFile] Info=\'Running cloud code\' url=' + request.params.url);
	try{
	 	var imageURL =request.params.url;    
		Parse.Cloud.httpRequest({
	        method: 'DELETE',
	        url: imageURL,
	        headers: {
	            "X-Parse-Application-Id": process.env.APP_ID,
	            "X-Parse-REST-API-Key" : process.env.APP_ID
	        }
	    }).then(function(result){
	    	response.success(true);
	    }, function(error){
	    	log.error('[deleteFile] Info=\'Error\' error=' + error.message);
			response.error(error.message);
	    });
	    
	} catch (e){
		log.error('[deleteFile] Info=\'Error\' error=' + e.message);
		response.error(e.message);
	}

});

Parse.Cloud.define('feedPet', function(req, res) {
	Parse.Cloud.useMasterKey();
	log.info('[feedPet] Info=\'Running cloud code\' petId=' + req.params.petId + ' fedBy=' + req.params.fedBy + ' fedAt=' + req.params.fedAt);
	var FeedingLog = Parse.Object.extend('FeedingLog');
	var feedingLog = new FeedingLog();
	
	var User = Parse.Object.extend('_User');
	var user = new User();
	user.id = req.params.fedBy;
	feedingLog.set('fedBy', user);
	feedingLog.set('fedAt', req.params.fedAt); 
	
	var Pet = Parse.Object.extend('Pet');
	var queryPet = new Parse.Query(Pet);
	
	var mPet;

	//user doesn't wait on this, so we can do it all sequentially
	user.fetch().then(
		function(user) {
			return queryPet.get(req.params.petId);
		}).then(
		function(pet) {
			log.debug('[feedPet] Info=\'Found pet from ID\' petname=' + pet.get('name'));
			mPet = pet;
			mPet.set('lastFed', req.params.fedAt);
			feedingLog.set('petFed', mPet);
			feedingLog.set('petFedName', mPet.get('name'));
			return feedingLog.save();
		}).then(function(feedingLog){
			log.debug('[feedPet] Info=\'Saved feedingLog successfully\'');
			var relation = mPet.relation('feedingLogs');
			relation.add(feedingLog);
			mPet.set('lastFeedingLog', feedingLog);
			mPet.set('lastFeedingUser', user);
			mPet.set('lastFedByName', user.get('displayName'));
			return mPet.save();
		}).then(function(pet){
			log.debug('[feedPet] Info=\'Saved pet successfully\'');
			res.success(pet);
		}, function(error) {
			log.error('[feedPet] Info=\'feedPet failed\' error=' + error.message);
			res.error(error.message);
		}); //errors are propagated through the promises until they encounter an error handler - so we only need one!
});

Parse.Cloud.define('addFriend', function(req, res) {
	Parse.Cloud.useMasterKey();
	log.info('[addFriend] Info=\'Running cloud code\' requestedId=' + req.params.requestedId + ' requesterId=' + req.params.requesterId + ' requestId=' + req.params.requestId + ' calledBy=' + req.params.calledById);

	var FriendRequest = Parse.Object.extend('FriendRequest');
	var User = Parse.Object.extend('_User');
	
	
	var friendRequest = new FriendRequest;
	friendRequest.id = req.params.requestId;
	friendRequest.destroy();

	var requester = new User;
	requester.id = req.params.requesterId;
	
	var requested = new User;
	requested.id = req.params.requestedId;

	var calledBy = new User;
	calledBy = req.params.calledById;
	

	var toSave = [requester,requested];
	
	requester.fetch().then(
		function(result){
			return requested.fetch;
		}).then(
		function(result){
			sendPushes([requester], calledBy, 'newFriend', requested);
			requester.relation('friends').add(requested);
			requested.relation('friends').add(requester);
			return Parse.Object.saveAll(toSave);
		}).then(
		function(result) {
			log.debug('[addFriend] Info=\'addFriend complete\'');
			res.success('OK');
		}, function(error) {
			log.error('[addFriend] Info=\'addFriend failed\' error=' + error.message);
			res.error(error.message);
		}); 
	
});

function containsId(id, list) {
	if(!list){
		return;
	}
    var i;
    for (i = 0; i < list.length; i++) {
        if (list[i] == id) {
            return true;
        }
	}

	return false;
}

Parse.Cloud.define('patPhoto', function(req, res){

	Parse.Cloud.useMasterKey();

	var Photo = Parse.Object.extend('Photo');
	var User = Parse.Object.extend('_User');

	var photo = new Photo;
	photo.id = req.params.photoId;

	photo.fetch().then(function(result){
		if(containsId(req.params.userId, photo.get('pattedBy'))){
			res.success(true);
			//already patted
		}
		var pattedBy = photo.get('pattedBy');
		if(!pattedBy){
			pattedBy = [];
		}
		pattedBy.push(req.params.userId);
		photo.set('pattedBy', pattedBy);

		if(!photo.get('numberPats')){
			photo.set('numberPats', 0);
		}
		photo.increment('numberPats');
		return photo.save();
	}).then(function(result){
		res.success(true);
	}, function(error){
		res.error(error.message);
	});
});

Parse.Cloud.define('declineRequest', function(req, res) {
	Parse.Cloud.useMasterKey();
	log.info('[declineRequest] Info=\'Running cloud code\' requestedId=' + req.params.requestedId + ' requesterId=' + req.params.requesterId + ' requestId=' + req.params.requestId);

	var FriendRequest = Parse.Object.extend('FriendRequest');
	
	
	var friendRequest = new FriendRequest;
	friendRequest.id = req.params.requestId;
	friendRequest.destroy().then(
	function(result) {
		log.debug('[declineRequest] Info=\'declineRequest complete\'');
		res.success('OK');
	}, function(error) {
		log.error('[declineRequest] Info=\'declineRequest failed\' error=' + error.message);
		res.error(error.message);
	}); 
	
});

Parse.Cloud.define('searchFriend', function(req, res) {
	Parse.Cloud.useMasterKey();
	log.info('[searchFriend] Info=\'Running cloud code\' searchTerm=' + req.params.searchTerm);

	  var queryUsername = new Parse.Query("_User");
	  queryUsername.startsWith("username_lowercase", req.params.searchTerm);
	  var queryDisplayName = new Parse.Query("_User");
	  queryDisplayName.startsWith("displayName_lowercase", req.params.searchTerm);

	  var query = Parse.Query.or(queryUsername, queryDisplayName);

	query.find().then(function(results){
			res.success(results);
		}, function(error){
			res.error(error.message);
		});	  
});

Parse.Cloud.define('setOwnersChanges', function(req, res) {
	Parse.Cloud.useMasterKey();
	log.info('[setOwnersChanges] Info=\'Running cloud code\' petId=' + req.params.petId + ' changeList=' + req.params.changeList);
	
	var Pet = Parse.Object.extend('Pet');
	var User = Parse.Object.extend('_User');
	
	var pet = new Pet;
	pet.id = req.params.petId;
	var relationFriends = pet.relation('owners');
	
	var toSave = [pet];
	
	req.params.changeList.forEach(function(change){
		var user = new User;
		user.id = change.id;
		
		relationPets = user.relation('friendPets');
		if(change.isFeeder){
			log.debug('[setOwnersChanges] Info=\'Adding pet to list\'');
			relationPets.add(pet);
			relationFriends.add(user);
		} else {
			log.debug('[setOwnersChanges] Info=\'Removing pet from list\'');
			relationPets.remove(pet);
			relationFriends.remove(user);
		}

		toSave.push(user);
	});
	
	
	Parse.Object.saveAll(toSave).then(function(result) {
		log.debug('[setOwnersChanges] Info=\'setOwnersChanges complete\'');
		res.success('OK');
	}, function(error) {
		log.error('[setOwnersChanges] Info=\'setOwnersChanges failed\' error=' + error.message);
		res.error(error.message);
	}); 
});


Parse.Cloud.define('getPosts', function(req, res) {
	Parse.Cloud.useMasterKey();
	log.info('[getPosts] Info=\'Running cloud code\' userId=' + req.params.userId + ' startPost=' + req.params.startPost + ' numPosts=' + req.params.numPosts);
	
	
	var User = Parse.Object.extend('_User');
	var user = new User;
	user.id = req.params.userId;
	
	var queryPosts = user.relation('posts').query();
	queryPosts.limit(req.params.numPosts);
	queryPosts.skip(req.params.startPost);
	queryPosts.include('image');
	queryPosts.descending('creationDay', 'updatedAt');

	queryPosts.find().then(function(results){
			res.success(results);
		}, function(error){
			res.error(error.message);
		});	  
	
});

Parse.Cloud.define('postAd', function(req, res) {
	try{

		log.info('[postAd] Info=\'Running cloud code\' photoId=' + req.params.photoId + ' title=' + req.params.title + ' url=' + req.params.url);
		if(req.user.getUsername() == 'adPostingUser'){
		    var password = req.params.password;

		    Parse.User.logIn(req.user.getUsername(), password).then(function(result){
				var Photo = Parse.Object.extend('Photo');
				var photo = new Photo;
				photo.id = req.params.photoId;

				var PublishQueue = Parse.Object.extend('PublishQueue');
				var queueItem = new PublishQueue;

				queueItem.set('type', 'ad');
				queueItem.set('req', req);
				queueItem.set('photo', photo);
				queueItem.set('title', req.params.title);
				queueItem.set('text', req.params.text);
				queueItem.set('url', req.params.url);

				return queueItem.save();
		    }, function(error){
		    	log.error('[postAd] Info=\'bad password\' error=' + error.message);
				res.error(error.message);
				return;
		    }).then(function(result){
		    	res.success(true);
		    }, function(error){
				log.error('[postAd] Info=\'postAd failed\' error=' + error.message);
				res.error(error.message);
				return;
		    });
		} else {
			res.error('not auth');
		}


		
	} catch (error){
		log.error('[postAd] Info=\'postAd failed\' error=' + error.message);
		res.error(error.message);
	}


});

