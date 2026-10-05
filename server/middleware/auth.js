const jwt = require('jsonwebtoken');
const User = require('../models/User');
async function auth(req, res, next) {
  const h=req.headers.authorization||'', token=h.startsWith('Bearer ')?h.slice(7):null;
  if(!token)return res.status(401).json({error:'Token de autenticação não fornecido.'});
  try{const payload=jwt.verify(token,process.env.JWT_SECRET);const user=await User.findById(payload.id).select('sessionVersion role').lean();if(!user)return res.status(401).json({error:'Sessão expirada. Faça login novamente.'});if((user.sessionVersion||0)!==(payload.sv||0))return res.status(401).json({error:'Sua senha foi alterada. Faça login de novo.'});req.user={id:payload.id,role:user.role};next();}catch(e){return res.status(401).json({error:e.name==='TokenExpiredError'?'Sessão expirada. Faça login novamente.':'Token inválido.'});}
}
module.exports=auth;
