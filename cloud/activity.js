var Parse = require('parse/node');
Parse.initialize(process.env.APP_ID, 'jCOBJ9Rmnkbmx6lD7GPYjPHkRfziK6QuOwTRggyq', process.env.MASTER_KEY); //middle var is js key - null
Parse.serverURL = process.env.SERVER_URL;

console.log('Running publish scheduled job');
//=========================
//common helpers
function publishCommon(req){
	var User = Parse.Object.extend('_User');
	var user = new User();
	user.id = req.params.userId;

	var Post = Parse.Object.extend('Post');
	var post = new Post();

	post.set('createdBy', user);

	return post;
}
//=========================

//=========================
//publish queue
//var PublishQueue = Parse.Object.extend('PublishQueue');
//var query = 


//=========================