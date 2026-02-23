const userModel = require('../models/user.model');
const emailService = require('../services/email.service');
const Jwt = require('jsonwebtoken');
/**  
* - User register controller
* - Post /api/auth/register
*/

async function userRegisterController(req, res) {
    const {email,password,name} = req.body;

    const isExists = await userModel.findOne({
        email:email
    
    });
    if(isExists){
        return res.status(422).json({
            message:'User already exists with this email',
            status : "failed"
        })
    }

    const user = await userModel.create({
        email:email,
        password:password,
        name:name
    })
    
    const token = Jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '3d'
    })
    
    res.cookie('token', token,);
    res.status(201).json({
        message:'User register successfully',
        user:{
            _id : user.id,
            email : user.email,
            name : user.name,
            status : "success",
        },
        status : "success",
        token : token
    })
    
    await emailService.sendRegisterEmail(user.email, user.name);
}


/**  
* - User logink controller
* - POST /api/auth/login
*/


async function userLoginController(req, res) {
    const {email,password} = req.body;

    const user = await userModel.findOne({
        email:email, 
    }).select('+password');

    if (!user){
        return res.status(401).json({
            message:'User not found with this email',
            status : "failed"
        })
    };
     const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword){
        return res.status(401).json({
            nessage : "Email or password is incorrect"
        })
    }
    
    const token = Jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '3d'
    })
    
    res.cookie('token', token,);
    res.status(200).json({
        message:'User logged in successfully',
        user:{
            _id : user.id,
            email : user.email,
            name : user.name,
            status : "success",
        },
        status : "success",
        token : token
    })
}


module.exports = {
    userRegisterController,
    userLoginController,
}
