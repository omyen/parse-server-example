
Parse.Cloud.define('feedPet', function(req, res) {
	res.success('Hi');
	/*var feedingLog = req.params.feedingLog;
	var pet = req.params.pet;
	
	feedingLog.save({
		success: function(feedingLog) {
			var relation = pet.relation('feedingLogs');
			relation.add(feedingLog);
			pet.save({
				success: function(pet) {
					res.success(pet);
				},
				error: function(error) {
					res.error(error);
				}
			});
		},
		error: function(error) {
			res.error(error);
		}
	});*/
});
