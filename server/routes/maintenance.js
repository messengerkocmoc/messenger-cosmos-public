// Maintenance toggle route
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

function adminAuth(req,res,next){
  const token = req.headers['x-admin-token'] || req.query.admin_token || (req.cookies && req.cookies.admin_token);
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({error:'Unauthorized'});
  next();
}

router.post('/toggle-maintenance', adminAuth, (req,res)=>{
  const flag = path.join(process.cwd(), 'maintenance.flag');
  if (fs.existsSync(flag)){
    fs.unlinkSync(flag);
    return res.json({message:'maintenance_disabled'});
  } else {
    fs.writeFileSync(flag, 'on');
    return res.json({message:'maintenance_enabled'});
  }
});

module.exports = router;
