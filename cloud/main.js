
Parse.Cloud.define('feedPet', function(req, res) {
	Parse.Cloud.useMasterKey();
	console.log('[feedPet] Info=\'Running cloud code\' petId=' + req.params.petId + ' fedBy=' + req.params.fedBy + ' fedAt=' + req.params.fedAt);
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
	queryPet.get(req.params.petId).then(function(pet) {
			console.log('[feedPet] Info=\'Found pet from ID\' petname=' + pet.get('name'));
			mPet = pet;
			mPet.set('lastFed', req.params.fedAt);
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
			res.error(error.message);
		}); //errors are propagated through the promises until they encounter an error handler - so we only need one!
});

Parse.Cloud.define('addFriend', function(req, res) {
	Parse.Cloud.useMasterKey();
	console.log('[addFriend] Info=\'Running cloud code\' requestedId=' + req.params.requestedId + ' requesterId=' + req.params.requesterId + ' requestId=' + req.params.requestId);

	//want a response that we set this immediately to confirm for the user - so let's reply as soon as we've set off the all the queries at once
	//don't handle errors

	//delete the request
	var FriendRequest = Parse.Object.extend('FriendRequest');
	var queryRequest = new Parse.Query(FriendRequest);
	
	queryRequest.get(req.params.requestId).then(function(friendRequest) {
		console.log('[addFriend] Info=\'Found friendRequest from ID, deleting\'');
		friendRequest.destroy();
	})
			
	//add the friend to both users
	
	//delete the request
	var User = Parse.Object.extend('_User');
	var queryRequester = new Parse.Query(User);
	var queryRequested = new Parse.Query(User);
	
	var mRequester;
	
	
	queryRequester.get(req.params.requesterId).then(function(requester) {
		console.log('[addFriend] Info=\'Found requester from ID\'');
		mRequester= requester;
		return queryRequested.get(req.params.requestedId);
	}).then(function(requested) {
		console.log('[addFriend] Info=\'Found requested from ID\'');
		mRequester.relation('friends').add(requested);
		requested.relation('friends').add(mRequester);
		
		mRequester.save();
		requested.save();
	});
	
	
	res.success();
});

Parse.Cloud.define('searchFriend', function(req, res) {
	Parse.Cloud.useMasterKey();
	console.log('[searchFriend] Info=\'Running cloud code\' searchTerm=' + req.params.searchTerm);

	/*var User = Parse.Object.extend('_User');
	var query = new Parse.Query(User);
	//query.equalTo('username_lowercase', req.params.searchTerm);
	//query.limit(20);

	query.find().then(function(results){
			console.log('[searchFriend] Info=\'Search successful\' searchTerm=' + searchTerm +' numberRetreived=' + results.length);
			res.success();
		}, function(error){
			console.log('[searchFriend] Info=\'Search failed\' searchTerm=' + searchTerm +' error=' + error.message);
			res.error(error.message);
		});
		*/

	  var query = new Parse.Query("_User");
	  query.startsWith("username_lowercase", req.params.searchTerm);
	  query.find({
		success: function(results) {
		  res.success(results);
		},
		error: function() {
		  res.error("movie lookup failed");
		}
	  });		
});

