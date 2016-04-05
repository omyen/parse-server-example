var Parse = require('parse/node');
Parse.initialize(process.env.APP_ID, '', process.env.MASTER_KEY); //middle var is js key - null
Parse.serverURL = process.env.SERVER_URL;

var RETRIES = 5;

function propagatePost(post){
	Parse.Cloud.useMasterKey();
	var toSave = [post.get('causingUser')]; //always show it to the person who caused it
	post.get('causingUser').relation('posts').add(post);

	Parse.Object.saveAll(toSave).then(function(result) {
		return true;
	}, function(error) {
		return false;
	}); 
}

function publishFedPet(feedingLog){
	console.log('[publishFedPet] Info=\'Processing object\' + fedBy=' + feedingLog.get('fedBy'));
	if(feedingLog.className != 'FeedingLog'){
		//unrecoverable, delete immediately
		console.log('[publishFedPet] Info=\'Wrong object type\' objectType=' + feedingLog.className);
		return true;
	}

	var Post = Parse.Object.extend('Post');
	var post = new Post();
	post.set('type', 'fedPet');

	//var queryUser = new Parse.Query('_User');
	feedingLog.get('fedBy').fetch().then(function(user) {
		console.log('[publishFedPet] Info=\'Retrieved user\'');
		post.set('title', user.get('displayName') + ' fed ' + feedingLog.get('petFedName'));
		post.set('causingUser', user);
		
		return feedingLog.get('petFed').fetch();
	}).then(function(pet){
		console.log('[publishFedPet] Info=\'Retrieved pet\'');
		post.set('aboutPet', pet);
		post.set('image', pet.get('profilePhoto'));
		return post.save();
	}).then(function(post){
		console.log('[publishFedPet] Info=\'Saved post\'');
		return propagatePost(post);
	}, function(error) {
		console.log('[publishFedPet] Info=\'Error\' error=' + error.message);
		return false;
	});
}


function processPublishQueue(){
	var query = new Parse.Query('PublishQueue');
	query.include('savedObject');

	query.find().then(function(publishQueue){
		publishQueue.forEach(function(queueItem){
			if(queueItem.get('retries') == null){
				queueItem.set('retries', 0);
				queueItem.save();
			}else if(queueItem.get('retries')>RETRIES){
				queueItem.destroy();
			} else {
				queueItem.set('retries', queueItem.get('retries') + 1);
				queueItem.save();
			}
			console.log('[processPublishQueue] Info=\'Processing post\' type=' + queueItem.get('type'));
			switch(queueItem.get('type')){
				case 'fedPet':
					//if success, destroy the item
					if(publishFedPet(queueItem.get('savedObject'))){
						queueItem.destroy();
					}
					break;
				default:
					console.log('[processPublishQueue] Info=\'Unknown post type\' type=' + queueItem.get('type'));
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