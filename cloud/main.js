//require('log-buffer');
var log = require('loglevel');

log.setLevel('debug');

Parse.Cloud.beforeSave('Pet', function(req, res) 
{
	var dirtyKeys = req.object.dirtyKeys();
	log.info('[beforeSave] Info=\'Pet\' dirtyKeysLength=' + dirtyKeys.length + ' dirtyKeys=' + dirtyKeys);

	req.object.set('lastDirtyKeys', dirtyKeys);
	res.success();
	//can't save any other objects in before save so add a lastDirtykeys for aftersave to look at
});

Parse.Cloud.afterSave('Pet', function(req) 
{
    var dirtyKeys = req.object.get('lastDirtyKeys');
    if(!dirtyKeys) {
    	log.error('[afterSave Pet] Info=\'No dirtyKeys\'');
		return; 
 	} 

	log.info('[afterSave Pet] Info=\'Pet\' dirtyKeysLength=' + dirtyKeys.length);

	var toSave = [];

	for (var i = 0; i < dirtyKeys.length; ++i) {
		var dirtyKey = dirtyKeys[i];
		switch(dirtyKey){
			case 'profilePhoto':
				log.debug('[afterSave Pet] Info=\'Pet profilePhoto is dirty\'');
				//profilePhoto is the latest photo
				var PublishQueue = Parse.Object.extend('PublishQueue');
				var queueItem = new PublishQueue;

				queueItem.set('type', 'newPetPhoto');
				queueItem.set('req', req);
				queueItem.set('causingUser', req.user);
				queueItem.set('aboutPet', req.object);
				queueItem.set('photo', req.object.get('profilePhoto'));

				toSave.push(queueItem);
				break;
			default:
				break;
		}
	}

	Parse.Object.saveAll(toSave)
});

Parse.Cloud.afterSave('FeedingLog', function(req) 
{
	log.info('[afterSave FeedingLog] Info=\'FeedingLog\'');
    var PublishQueue = Parse.Object.extend('PublishQueue');
	var queueItem = new PublishQueue;

	queueItem.set('type', 'fedPet');
	queueItem.set('req', req);
	queueItem.set('causingUser', req.object.get('fedBy'));
	queueItem.set('aboutPet', req.object.get('petFed'));

	queueItem.save();
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

Parse.Cloud.define('signUp', function(req, res) {
	//Parse.Cloud.useMasterKey();
	//ok to get password in the clear since we are running over https
	log.info('[signUp] Info=\'Running cloud code\' username=' + req.params.username + ' password=' + req.params.password + ' email=' + req.params.email);

	promises = [];

	//email is private data
	var PrivateData = Parse.Object.extend('PrivateData');
	var privateData = new PrivateData();
	privateData.set('email', req.params.email);
	promises.push(privateData.save());

	var User = Parse.Object.extend('_User');
	var user = new User();
	user.set('username', req.params.username);
	user.set('username_lowercase', req.params.username.toLowerCase()); //for searching
	user.set('password', req.params.password);
	promises.push(user.signUp());

	var Post = Parse.Object.extend('Post');
	var post = new Post();
	post.set('type', 'signUp');
	post.set('title', 'Welcome to Doubledip!');
	post.set('text', 'This is your activity feed, where you\'ll see everything happening on your network. \
		Try adding a new pet in the Pets tab, or find your friends in the Friends tab.'
		);
	post.set('numberPats', 0);
	promises.push(post.save());

	Parse.Promises.when(promises).then(
		function(results){
			user.relation('posts').add(post);
			var acl = new Parse.ACL();
			acl.setPublicReadAccess(true);
			acl.setWriteAccess(user, true);
			user.setACL(acl);
			promises = [user.save(null, {useMasterKey:true})];

			var acl = new Parse.ACL();
			acl.setPublicReadAccess(false);
			acl.setWriteAccess(user, true);
			privateData.setACL(acl);
			promises.push(privateData.save());

			return Parse.Promises.when(promises);
		}).then(
		function(user){
			log.debug('[signup] Info=\'Saved user\'');
			res.success(user);
		}, 
		function(error){
			log.error('[signup] Info=\'Signup failed\' error=' + error.message);
			res.error(error.message);
		});
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
	queryPet.get(req.params.petId).then(
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
	log.info('[addFriend] Info=\'Running cloud code\' requestedId=' + req.params.requestedId + ' requesterId=' + req.params.requesterId + ' requestId=' + req.params.requestId);

	var FriendRequest = Parse.Object.extend('FriendRequest');
	var User = Parse.Object.extend('_User');
	
	
	var friendRequest = new FriendRequest;
	friendRequest.id = req.params.requestId;
	friendRequest.destroy();

	var requester = new User;
	requester.id = req.params.requesterId;
	
	var requested = new User;
	requested.id = req.params.requestedId;
	
	
	requester.relation('friends').add(requested);
	requested.relation('friends').add(requester);
	
	var toSave = [requester,requested];
	
	Parse.Object.saveAll(toSave).then(
		function(result) {
			log.debug('[addFriend] Info=\'addFriend complete\'');
			res.success('OK');
		}, function(error) {
			log.error('[addFriend] Info=\'addFriend failed\' error=' + error.message);
			res.error(error.message);
		}); 
	
});

Parse.Cloud.define('searchFriend', function(req, res) {
	Parse.Cloud.useMasterKey();
	log.info('[searchFriend] Info=\'Running cloud code\' searchTerm=' + req.params.searchTerm);

	  var query = new Parse.Query("_User");
	  query.startsWith("username_lowercase", req.params.searchTerm);

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
			log.debug('[setFeedersChanges] Info=\'Adding pet to list\'');
			relationPets.add(pet);
			relationFriends.add(user);
		} else {
			log.debug('[setFeedersChanges] Info=\'Removing pet from list\'');
			relationPets.remove(pet);
			relationFriends.remove(user);
		}

		toSave.push(user);
	});
	
	
	Parse.Object.saveAll(toSave).then(function(result) {
		log.debug('[addFriend] Info=\'setFeedersChanges complete\'');
		res.success('OK');
	}, function(error) {
		log.error('[addFriend] Info=\'setFeedersChanges failed\' error=' + error.message);
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
	queryPosts.include('pattedBy');
	queryPosts.descending('updatedAt');

	queryPosts.find().then(function(results){
			res.success(results);
		}, function(error){
			res.error(error.message);
		});	  
	
});

