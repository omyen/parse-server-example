var Parse = require('parse/node');
Parse.initialize(process.env.APP_ID, process.env.MASTER_KEY);
Parse.serverURL = process.env.SERVER_URL;

var RETRIES = 5;

function propagatePost(post){
	var toSave = [post.get('causingUser')]; //always show it to the person who caused it

	Parse.Object.saveAll(toSave).then(function(result) {
		return true;
	}, function(error) {
		return false;
	}); 
}

function publishFedPet(feedingLog){
	if(savedObject.get('className') != 'FeedingLog'){
		//unrecoverable, delete immediately
		return true;
	}

	var Post = Parse.Object.extend('Post');
	var post = new Post();
	post.set('type', 'fedPet');

	var queryUser = new Parse.Query('_User');
	queryUser.get(feedingLog.fedBy.get('objectId')).then(function(user) {
		post.set('title', user.get('displayName') + ' fed ' + feedingLog.get('petFedName'));
		post.set('causingUser', user);
		
		var queryPet = new Parse.Query('Pet');
		return queryPet.get(feedingLog.petFed.get('objectId'));
	}).then(function(pet){
		post.set('aboutPet', pet);
		post.set('image', pet.get('profilePhoto'));
		return post.save();
	}).then(function(post){
		return propagatePost(post);
	}, function(error) {
		return false;
	});
}


function processPublishQueue(){
	var query = new Parse.Query('PublishQueue');
	query.include('savedObject');

	query.find().then(function(publishQueue){
		publishQueue.forEach(function(queueItem){

			if(queueItem.get('retries')>RETRIES){
				queueItem.destroy();
			} else {
				queueItem.set('retries', queueItem.get('retries') + 1);
			}

			switch(queueItem.get('type')){
				case 'fedPet':
					//if success, destroy the item
					if(publishFedPet(queueItem.get('savedObject'))){
						queueItem.destroy();
					}
					break;
				default:
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