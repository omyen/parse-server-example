
Parse.Cloud.define('feedPet', function(req, res) {
	Parse.Cloud.useMasterKey();
	console.log('[feedPet] Info=\'Running cloud code\' petID=' + req.params.petID + ' fedBy=' + req.params.fedBy + ' fedAt=' + req.params.fedAt);
	var FeedingLog = Parse.Object.extend("FeedingLog");
	var feedingLog = new FeedingLog();
	
	feedingLog.set('fedBy', req.params.fedBy);
	feedingLog.set('fedAt', req.params.fedAt); 
	
	var Pet = Parse.Object.extend("Pet");
	var queryPet = new Parse.Query(Pet);
	
	var mPet;

	queryPet.get(req.params.petID).then(function(pet) {
			console.log('[feedPet] Info=\'Found pet from ID\' petname=' + pet.get('name'));
			mPet = pet;
			return feedingLog.save();
		}).then(function(feedingLog){
			console.log('[feedPet] Info=\'Saved feedingLog successfully\'');
			var relation = mPet.relation('feedingLogs');
			relation.add(feedingLog);
			return mPet.save();
		}).then(function(pet){
			console.log('[feedPet] Info=\'Saved pet successfully\'');
			res.success(pet);
		}, function(error) {
			console.log('[feedPet] Info=\'feedPet failed\' error=' + error.message);
			res.error(error);
		}); //errors are propagated through the promises until they encounter an error handler - so we only need one!
});
