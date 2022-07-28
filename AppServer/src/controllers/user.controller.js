const UserVerification = require("../models/user.verification.model");
const User = require("../models/user.model");
const config = require("../../config.json");
const jwt = require('jsonwebtoken');
const Bcrypt = require("bcryptjs");
const secret = "kalvin-secret-key";
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

// Create transporter to nodemailer
const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: config.email.AUTH_EMAIL,
		pass: config.email.AUTH_PASS
	}
});
// Verify the transporter
transporter.verify((error,success) => {
	if(error){
		console.log(error);
	}else{
		console.log("Nodemailer email status:"+success);
	}
});
// Send verification
const sendVerification = (user,res) => {
	//url to be used in email
	const currentUrl = config.url;
	const uniqueString = uuidv4();
	const mailOptions = {
		from: config.email.AUTH_EMAIL,
		to: user.email,
		subject: "Verify your Email",
		html: `<p>Verify your email address to complete the signup and login into your account.</p><p>This link <b>expires in 6 hours</b>.</p><p>Press <a href=${currentUrl+"/user/verify/"+user.id+"/"+uniqueString}>here</a> to proceed.</p>`
	}
	let userVerification = new UserVerification({
		userId: user.id,
		uniqueString: Bcrypt.hashSync(uniqueString, 12),
		createdAt: new Date(Date.now()),
		expiresAt: new Date(Date.now()+21600000)
	})
	UserVerification.create(userVerification, (error,result) => {
		if(!error){
			// email verification send
			transporter.sendMail(mailOptions,(err,info)=>{
				if(!err){
					res.send({ message: "Verification email sent." , result, info });
				} else {
					res.status(500).send({ message: "Some error occurred while sending email." , err })
				}
			})
		} else {
			res.status(500).send({ message: "Some error occurred saving verification.", error })
		}
	})
}
// Check if signin uses username or email
const checkUsernameEmail = (user, result) => {
	if (/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(user)) {
		// Login using email address
		User.findByEmail(user.trim(), (err, res) => {
			result(err, res);
		})
    } else {
		// Login using username
		User.findByUsername(user.trim(), (err, res) => {
			result(err, res);
		})
	}
}
// User login
exports.signin = (req, res, next) => {
	// Validate Request
	if (!req.body) {
		// res.status(400).send({ message: "Content can not be empty!" });
		res.status(400);
		next();
	}
	checkUsernameEmail(req.body.username, (error,result) => {
		if(error === 'NOT_FOUND'){
			res.status(404);
			// req.signinFail++;
			next();
		}else if(error){
			// res.status(500).send({ message: "Error retrieving User", error: error });
			res.status(500);
			next();
		}else{
			let passwordIsEqual = Bcrypt.compareSync(req.body.password, result.password);
			if(passwordIsEqual){
				if(!result.verified){
					// res.status(403).send({message: "Email hasn't been verified yet.", email: result.email});
				}else{
					res.status(200);
					req.result = result;
					next();
				}
			}else{
				// res.status(401).send({ message: "Incorrect password!" });
				res.status(401);
				next();
			}
		}
	});
}
exports.login = (req,res) => {
	if(req.result){
		let token = jwt.sign({
			id: req.result.id
		},secret,{expiresIn: 86400});
		res.send({ 
			id:req.result.id,
			username: req.result.username,
			email: req.result.email,
			role: req.result.role,
			token: token
		});
	}else if(res.statusCode === 404){
		res.send({ message: "User not found" });
	}else{
		res.send({ message: "Others"});
	}
}
// User signup
exports.signup = (req, res, next) => {
	// Validate request
	if (!req.body) {
			res.status(400).send({
					message: "Content can not be empty!"
			});
	}
	// Checking if user already exists
	User.findByUsername(req.body.username, async (usernameError,udata) => {
		User.findByEmail(req.body.email, (mailError,edata) => {
			if((!mailError && !usernameError) && (udata.id === edata.id)){
				res.status(409).send({
					title: "Exist",
					message: "User is already exist, please login using your username " + req.body.username
				});
			} else if(!usernameError) {
				res.status(409).send({
					title: "Username",
					message: "A user is already exist using your username " + req.body.username
				});
			} else if(!mailError) {
				res.status(409).send({
					title: "Email",
					message: "A user is already exist using your email address " + req.body.email
				});
			}else{
				if (usernameError === "NOT_FOUND" && mailError === "NOT_FOUND") {
					next();
				} else {
					res.status(500).send({ message: "Error checking for existing user in database", mailError });
				}
			}
		})
	})
}
// User success for rate limit middleman
exports.register = (req,res) => {
	// Create a User
	let user = new User({
			username: req.body.username,
			email: req.body.email,
			password: Bcrypt.hashSync(req.body.password, 12),
			role: 'ap',
	});
	User.create(user, (error, result) => {
			if (!error){
				sendVerification(result,res);
			} else {
				res.status(500).send({ message: "Some error occurred while creating the User.", error });
			}
	});
}
// Resend verification if verify is less than 3
exports.resendVerification = (req, res) =>{
	User.findByEmail(req.body.unverifiedEmail, (error, result)=>{
		if(!error){
			if(!result.verified){
				UserVerification.findById(result.id, (errr,ress)=>{
					if(!errr){
						if(ress.length < 3){
							sendVerification(result,res);
						}else{
							if(ress[0].expiresAt < Date.now()){
								UserVerification.deleteById(result.id,(err) => {
									if(!err){
										sendVerification(result,res);
									}else{
										res.status(500).send({ message: "An error occured while deleting verification" })
									}
								})
							} else {
								res.status(406).send({ message: "Too many email verification found. Please wait for the 6 hours and try come again." })
							}
						}
					}else if(errr === "NOT_FOUND"){
						sendVerification(result,res);
					}else{
						res.status(500).send({ message: "An error occured while looking for verification" })
					}
				})
			}else{
				res.status(409).send({message: "Your account is already validated. This error is not normal, We will inform the server for this report. thank you for understanding"})
				console.log("User is trying to resend verification while it is already verified.")
			}
		}else if (error === "NOT_FOUND"){
			res.status(404).send({ message: "Failed sending verification, due to user email not found" })
		}else{
			res.status(500).send({ message: "An error occured during the search of user email" })
		}
	})
}
// Verify email confimation
exports.verify = (req,res) => {
	let userId = req.params.id.trim();
	let uniqueString = req.params.uniqueString.trim();
	UserVerification.findById(userId, (error,result)=>{
		if(!error){
			if(result[0].expiresAt < Date.now()){
				UserVerification.deleteById(userId,(err)=>{
					if(!err){
						User.deleteById(userId,(er)=>{
							if(!er){
								res.status(401).send({ message: "Verification code expired. Please sign up again" })
							}else if(er === "NOT_FOUND"){
								res.status(404).send({ message: "User not found" })
							}else{
								res.status(500).send({ message:"Some error occured while deleting expired user by verification" })
							}
						})
					}else if(err === "NOT_FOUND"){
						res.status(404).send({ message: "Verification not found" })
					}else{
						res.status(500).send({ message:"Some error occured while deleting verification",err })
					}
				})
			}else{
				equalString = Bcrypt.compareSync(uniqueString,result[0].uniqueString);
				if(equalString){
					User.updateVerified(userId, true, (err) => {
						if(!err){
							UserVerification.deleteById(userId,(er)=>{
								if(!err){
									res.send({ message: "Successfully verified!" })
								}else if(er === "NOT_FOUND"){
									res.status(404).send({ message: "Removing verification not found" })
								}else{
									res.status(500).send({ message:"Some error occured while removing verification",err })
								}
							})
						}else if(err === "NOT_FOUND"){
							res.status(404).send({ message: "Update a user not found" })
						}else{
							res.status(500).send({ message:"Some error occured while updating user",err })
						}
					})
				}else{
					res.status(401).send({ message: "Invalid verification details passed. Please check your inbox"})
				}
			}
		} else {
			if(error === "NOT_FOUND"){
				res.status(404).send({ message: "User verification not found" })
			}else{
				res.status(500).send({ message:"Some error occured while finding user" })
			}
		}
	})
}
// Find a single user by Username
exports.findByUsername = (req, res) => {
	let username = req.params.username.trim();
	User.findByUsername(username, (error, result) => {
		if (!error) {
			res.send(result);
		} else {
			if (error === "NOT_FOUND") {
				res.status(404).send({ message: "A user not found with username of " + username });
			} else {
				res.status(500).send({ message: "Error retrieving a user in database", error });
			}
		}
	})
}
// Find a single user by email
exports.findByEmail = (req, res) => {
	let email = req.params.email.trim();
	User.findByEmail(email, (error, result) => {
		if (!error) {
			res.send(result);
		} else {
			if (error === "NOT_FOUND") {
				res.status(404).send({ message: "A user not found with email of " + email });
			} else {
				res.status(500).send({ message: "Error retrieving a user in database", error });
			}
		}
	})
}