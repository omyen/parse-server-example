var Parse = require('parse/node');
Parse.initialize(process.env.APP_ID, process.env.MASTER_KEY);
Parse.serverURL = process.env.SERVER_URL;

var RETRIES = 5;

function publishFedPet(savedObject){
	if(savedObject.get('className') != 'FeedingLog'){
		//unrecoverable, delete immediately
		return true;
	}

	var query = new Parse.query('FeedingLog');
	query.get(savedObject.get('objectId')).then(function(feedingLog) {
		console.log(feedingLog);
	}, function(error) {
		return false;
	});

	return true;
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