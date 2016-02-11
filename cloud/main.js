
function contains(a, obj) {
    var i = a.length;
    while (i--) {
       if (a[i] === obj) {
           return true;
       }
    }
    return false;
}


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
	
	
	res.success('OK');
});

Parse.Cloud.define('searchFriend', function(req, res) {
	Parse.Cloud.useMasterKey();
	console.log('[searchFriend] Info=\'Running cloud code\' searchTerm=' + req.params.searchTerm);

	  var query = new Parse.Query("_User");
	  query.startsWith("username_lowercase", req.params.searchTerm);

	query.find().then(function(results){
			res.success(results);
		}, function(error){
			res.error(error.message);
		});	  
});


Parse.Cloud.define('manageFeeders', function(req, res) {
	Parse.Cloud.useMasterKey();
	console.log('[manageFeeders] Info=\'Running cloud code\' petId=' + req.params.petId + ' userId=' + req.params.userId);
	
	
	var User = Parse.Object.extend('_User');
	var queryUser = new Parse.Query(User);

	var Pet = Parse.Object.extend('Pet');
	var queryPet = new Parse.Query(Pet);
	
	var mPet;
	var mUser;
	var mFriends;

	//user doesn't wait on this, so we can do it all sequentially
	queryUser.get(req.params.userId).then(function(user) {
			console.log('[manageFeeders] Info=\'Found user from ID\' username=' + user.get('username'));
			mUser = user;
			var queryFriends = user.relation('friends').query();
			return queryFriends.run();
		}).then(function(friends){
			console.log('[manageFeeders] Info=\'Retrieved friends successfully\' numberRetrieved=' + friends.length);
			mFriends= friends;
			return queryPet.get(req.params.petId);
		}).then(function(pet){
			console.log('[feedPet] Info=\'Found pet from ID\' name=' + pet.get('name'));
			mPet = pet;
			var queryFeeders = pet.relation('users').query();
			return queryFeeders.run();
		}).then(function(feeders){
			console.log('[manageFeeders] Info=\'Retrieved feeders successfully\' numberRetrieved=' + feeders.length);
			mFriends.forEach(function(friend) {
				if(contains(mFeeders, friend){
					friend.isFeeder = true;
				}
			});
			
			res.success(mFriends);
		}, function(error) {
			console.log('[manageFeeders] Info=\'manageFeeders failed\' error=' + error.message);
			res.error(error.message);
		}); //errors are propagated through the promises until they encounter an error handler - so we only need one!
});

