Parse.Cloud.beforeSave(Parse.User, function(request, response) {
	//TODO make a class for private data and link it
	//if (!request.object.existed()) {
		//request.object.setACL(new Parse.ACL(request.object));
		response.success();  
	//}
});

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
			feedingLog.set('petFed', mPet);
			feedingLog.set('petFedName', mPet.get('name'));
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

	var FriendRequest = Parse.Object.extend('FriendRequest');
	var friendRequest = new FriendRequest;
	friendRequest.id = req.params.requestId;
	friendRequest.destroy();

	var User = Parse.Object.extend('_User');
	
	var requester = new User;
	requester.id = req.params.requesterId;
	
	var requested = new User;
	requested.id = req.params.requestedId;
	
	
	requester.relation('friends').add(requested);
	requested.relation('friends').add(requester);
	
	var toSave = [requester,requested];
	
	Parse.Object.saveAll(toSave).then(function(result) {
		console.log('[addFriend] Info=\'addFriend complete\'');
		res.success('OK');
	}, function(error) {
		console.log('[addFriend] Info=\'addFriend failed\' error=' + error.message);
		res.error(error.message);
	}); 
	/*
	//delete the request
	var FriendRequest = Parse.Object.extend('FriendRequest');
	var queryRequest = new Parse.Query(FriendRequest);
	
	queryRequest.get(req.params.requestId).then(function(friendRequest) {
		console.log('[addFriend] Info=\'Found friendRequest from ID, deleting\'');
		friendRequest.destroy();
	})
			
	//add the friend to both users
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
		return requested.save();
	}).then(function(result) {
		console.log('[addFriend] Info=\'Saved requested\' requestedName=' + result.get('username'));
		return mRequester.save();
	}).then(function(result) {
		console.log('[addFriend] Info=\'Saved requester\' requesterName=' + result.get('username'));
		res.success('OK');
	}, function(error) {
		console.log('[addFriend] Info=\'addFriend failed\' error=' + error.message);
		res.error(error.message);
	}); //errors are propagated through the promises until they encounter an error handler - so we only need one!
	*/
	
	
	
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

Parse.Cloud.define('setFeedersChanges', function(req, res) {
	//holy shit maybe this whole thing should be a join table
	Parse.Cloud.useMasterKey();
	console.log('[setFeedersChanges] Info=\'Running cloud code\' petId=' + req.params.petId + ' changeList=' + req.params.changeList);
	
	
	var Pet = Parse.Object.extend('Pet');
	var queryPet = new Parse.Query(Pet);
	
	var mPet;

	//user doesn't wait on this, so we can do it all sequentially
	queryPet.get(req.params.petId).then(function(pet) {
			console.log('[setFeedersChanges] Info=\'Found pet from ID\' petname=' + pet.get('name'));
			mPet = pet;

			var promises = [];

			req.params.changeList.forEach(function(change){
				var User = Parse.Object.extend('_User');
				var queryUser = new Parse.Query(User);

				console.log('[setFeedersChanges] Info=\'Finding user from id\' id=' + change.id);
				promises.push(queryUser.get(change.id));
			});
			

			return Parse.Promise.when(promises);
		}).then(function(results){
			console.log('[setFeedersChanges] Info=\'Found users from ID\' numUsers=' + results.length);
			var toSave = [];
			
			var index = 0;
			//this assumes the lists are in the same order... dangerous?
			results.forEach(function(user){
				relationPets = user.relation('friendPets');
				if(req.params.changeList[index].isFeeder){
					console.log('[setFeedersChanges] Info=\'Adding pet to list\'');
					relationPets.add(mPet);
				} else {
					console.log('[setFeedersChanges] Info=\'Removing pet from list\'');
					relationPets.remove(mPet);
				}
				toSave.push(user);
				index++;
			});
			return Parse.Object.saveAll(toSave);
		}).then(function(results){
			console.log('[setFeedersChanges] Info=\'Saved all users\'');
			res.success('OK');
		}, function(error) {
			console.log('[setFeedersChanges] Info=\'setFeedersChanges failed\' error=' + error.message);
			res.error(error.message);
		}); //errors are propagated through the promises until they encounter an error handler - so we only need one!
});

