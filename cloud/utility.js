module.exports.contains = 	function(a, obj) {
		console.log('contains');
		var i = a.length;
		console.log('length=' + i);
		while (i--) {
			console.log('i=' + i);
			if (a[i] === obj) {
			   return true;
			}
		}
		return false;
	}