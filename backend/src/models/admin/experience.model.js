const sql = require("../../utils/database");

const Experience = function(experience){
	this.id = experience.id;
	this.applicantId = experience.applicantId;
	this.positionDesignation = experience.positionDesignation;
	this.from = experience.from;
	this.to = experience.to;
}
Experience.findByApplicantId = (id, result) => {
	sql.query("SELECT * FROM experiences WHERE applicantId = ?", id , (err, res) => {
		if (err) {
			result(err);
		} else if(!res.length) {
			result("NOT_FOUND");
		} else {
			result(null, res);
		}
	});
}
Experience.create = (newExperience, result) => {
	sql.query("INSERT INTO experiences SET ?", newExperience, (err, res) => {
		if (err) {
			result(err);
		} else {
			result(null, { applicantId: res.insertId, ...newExperience });
		}
	});
}
Experience.removeExperiencesByApplicant = (applicantId, result) => {
	sql.query("DELETE FROM experiences WHERE applicantId = ?", applicantId, (err,res) => {
		if(err){
			result(err);
		} else {
			result(null, res);
		}
	});
}
module.exports = Experience;