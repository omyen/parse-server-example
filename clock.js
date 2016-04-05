var RETRIES = 5;

function publishFedPet(feedingLog){
	console.log('Running publishFedPet');

	return true;
}


function processPublishQueue(){
	var Parse = require('parse/node');
	Parse.initialize(process.env.APP_ID, process.env.MASTER_KEY);
	Parse.serverURL = process.env.SERVER_URL;
	console.log('Running publish scheduled job from clock.js');

	var query = new Parse.Query('PublishQueue');

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
					if(publishFedPet(queueItem.get('feedingLog'))){
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