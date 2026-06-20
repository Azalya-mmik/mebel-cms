const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { run, get, all } = require('../db/init');
const { requireAuth, logAction } = require('../middleware/auth');
const nodemailer = require('nodemailer');

router.use(requireAuth);

router.get('/dashboard', async (req, res) => {
  try {
    const weekAgo = new Date(Date.now()-7*86400000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now()-30*86400000).toISOString().split('T')[0];
    const [vToday,vWeek,vMonth,newLeads,totalLeads] = await Promise.all([
      get("SELECT COUNT(DISTINCT session_id) c FROM visits WHERE date(created_at)=date('now')"),
      get("SELECT COUNT(DISTINCT session_id) c FROM visits WHERE date(created_at)>=?",[weekAgo]),
      get("SELECT COUNT(DISTINCT session_id) c FROM visits WHERE date(created_at)>=?",[monthAgo]),
      get("SELECT COUNT(*) c FROM leads WHERE status='new'"),
      get("SELECT COUNT(*) c FROM leads"),
    ]);
    const [topPages,recentLeads,chartData,deviceStats] = await Promise.all([
      all("SELECT page,COUNT(*) cnt FROM visits WHERE date(created_at)>=? GROUP BY page ORDER BY cnt DESC LIMIT 5",[weekAgo]),
      all("SELECT * FROM leads ORDER BY created_at DESC LIMIT 5"),
      all("SELECT date(created_at) d,COUNT(DISTINCT session_id) c FROM visits WHERE date(created_at)>=? GROUP BY d ORDER BY d",[weekAgo]),
      all("SELECT device,COUNT(*) c FROM visits WHERE date(created_at)>=? GROUP BY device",[weekAgo]),
    ]);
    res.json({stats:{visitsToday:vToday.c,visitsWeek:vWeek.c,visitsMonth:vMonth.c,newLeads:newLeads.c,totalLeads:totalLeads.c},topPages,recentLeads,chartData,deviceStats});
  } catch(e){res.status(500).json({error:e.message});}
});

router.get('/products', async (req,res) => {
  try{res.json(await all('SELECT * FROM products ORDER BY sort_order,id DESC'));}
  catch(e){res.status(500).json({error:e.message});}
});
router.post('/products', async (req,res) => {
  const {name,description,price,category,status}=req.body;
  if(!name) return res.status(400).json({error:'Название обязательно'});
  try{
    const r=await run('INSERT INTO products(name,description,price,category,status) VALUES(?,?,?,?,?)',[name,description||'',parseInt(price)||0,category||'other',status||'available']);
    logAction('product_create',`Создан: ${name}`,req);
    res.json({id:r.lastID});
  }catch(e){res.status(500).json({error:e.message});}
});
router.put('/products/:id', async (req,res) => {
  const {name,description,price,category,status,sort_order}=req.body;
  try{
    await run('UPDATE products SET name=?,description=?,price=?,category=?,status=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[name,description||'',parseInt(price)||0,category||'other',status||'available',parseInt(sort_order)||0,req.params.id]);
    logAction('product_update',`Обновлён ID ${req.params.id}`,req);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
router.delete('/products/:id', async (req,res) => {
  try{
    const p=await get('SELECT * FROM products WHERE id=?',[req.params.id]);
    if(p&&p.image){try{fs.unlinkSync(path.join(__dirname,'..','public',p.image));}catch(e){}}
    await run('DELETE FROM products WHERE id=?',[req.params.id]);
    logAction('product_delete',`Удалён ID ${req.params.id}`,req);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
router.post('/products/:id/image',(req,res)=>{
  if(!req.files||!req.files.image) return res.status(400).json({error:'Нет файла'});
  const file=req.files.image;
  const ext=path.extname(file.name).toLowerCase();
  if(!['.jpg','.jpeg','.png','.webp'].includes(ext)) return res.status(400).json({error:'Только JPG/PNG/WEBP'});
  const filename=`product_${req.params.id}_${Date.now()}${ext}`;
  file.mv(path.join(__dirname,'..','public','uploads',filename),async(err)=>{
    if(err) return res.status(500).json({error:'Ошибка загрузки'});
    await run('UPDATE products SET image=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[`/uploads/${filename}`,req.params.id]);
    res.json({url:`/uploads/${filename}`});
  });
});

router.get('/leads', async (req,res) => {
  try{
    const {status,from,to,limit=100,offset=0}=req.query;
    let q='SELECT * FROM leads WHERE 1=1',p=[];
    if(status){q+=' AND status=?';p.push(status);}
    if(from){q+=' AND date(created_at)>=?';p.push(from);}
    if(to){q+=' AND date(created_at)<=?';p.push(to);}
    q+=' ORDER BY created_at DESC LIMIT ? OFFSET ?';p.push(parseInt(limit),parseInt(offset));
    const [leads,total]=await Promise.all([all(q,p),get('SELECT COUNT(*) c FROM leads')]);
    res.json({leads,total:total.c});
  }catch(e){res.status(500).json({error:e.message});}
});
router.post('/leads', async (req,res) => {
  const {name,phone,message,source}=req.body;
  if(!phone) return res.status(400).json({error:'Телефон обязателен'});
  try{
    const r=await run('INSERT INTO leads(name,phone,message,source) VALUES(?,?,?,?)',[name||'',phone,message||'',source||'site']);
    sendEmail({name,phone,message}).catch(()=>{});
    res.json({id:r.lastID,ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
router.put('/leads/:id/status', async (req,res) => {
  const {status}=req.body;
  if(!['new','working','done','rejected'].includes(status)) return res.status(400).json({error:'Недопустимый статус'});
  try{
    await run('UPDATE leads SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[status,req.params.id]);
    logAction('lead_status',`Заявка ${req.params.id} → ${status}`,req);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
router.delete('/leads/:id', async (req,res) => {
  try{await run('DELETE FROM leads WHERE id=?',[req.params.id]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});
router.get('/leads/export', async (req,res) => {
  try{
    const leads=await all('SELECT * FROM leads ORDER BY created_at DESC');
    const csv='ID,Имя,Телефон,Сообщение,Статус,Дата\n'+leads.map(l=>[l.id,`"${l.name}"`,`"${l.phone}"`,`"${(l.message||'').replace(/"/g,'""')}"`,l.status,l.created_at].join(',')).join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="leads.csv"');
    res.send('\uFEFF'+csv);
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/settings', async (req,res) => {
  try{const rows=await all('SELECT * FROM settings');const s={};rows.forEach(r=>s[r.key]=r.value);res.json(s);}
  catch(e){res.status(500).json({error:e.message});}
});
router.post('/settings', async (req,res) => {
  const allowed=['phone','address','email','vk','telegram','whatsapp','site_name','site_tagline','banner_active','banner_title','banner_text'];
  try{
    for(const key of allowed) if(req.body[key]!==undefined) await run('INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',[key,req.body[key]]);
    logAction('settings_update','Настройки обновлены',req);res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/reviews', async (req,res) => {
  try{res.json(await all('SELECT * FROM reviews ORDER BY created_at DESC'));}catch(e){res.status(500).json({error:e.message});}
});
router.put('/reviews/:id/status', async (req,res) => {
  try{await run('UPDATE reviews SET status=? WHERE id=?',[req.body.status,req.params.id]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});
router.delete('/reviews/:id', async (req,res) => {
  try{await run('DELETE FROM reviews WHERE id=?',[req.params.id]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});
router.post('/reviews/submit', async (req,res) => {
  const {author,text,rating}=req.body;
  if(!author||!text) return res.status(400).json({error:'Заполните все поля'});
  try{await run('INSERT INTO reviews(author,text,rating) VALUES(?,?,?)',[author,text,parseInt(rating)||5]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});

router.get('/portfolio', async (req,res) => {
  try{res.json(await all('SELECT * FROM portfolio ORDER BY sort_order,id DESC'));}catch(e){res.status(500).json({error:e.message});}
});
router.post('/portfolio',(req,res)=>{
  if(!req.files||!req.files.image) return res.status(400).json({error:'Нет файла'});
  const file=req.files.image;
  const filename=`portfolio_${Date.now()}${path.extname(file.name)}`;
  file.mv(path.join(__dirname,'..','public','uploads',filename),async(err)=>{
    if(err) return res.status(500).json({error:'Ошибка загрузки'});
    const r=await run('INSERT INTO portfolio(title,description,image) VALUES(?,?,?)',[req.body.title||'Работа',req.body.description||'',`/uploads/${filename}`]);
    res.json({id:r.lastID});
  });
});
router.delete('/portfolio/:id', async (req,res) => {
  try{
    const item=await get('SELECT * FROM portfolio WHERE id=?',[req.params.id]);
    if(item&&item.image){try{fs.unlinkSync(path.join(__dirname,'..','public',item.image));}catch(e){}}
    await run('DELETE FROM portfolio WHERE id=?',[req.params.id]);res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/faq', async (req,res) => {
  try{res.json(await all('SELECT * FROM faq ORDER BY sort_order,id'));}catch(e){res.status(500).json({error:e.message});}
});
router.post('/faq', async (req,res) => {
  const {question,answer}=req.body;
  if(!question||!answer) return res.status(400).json({error:'Заполните все поля'});
  try{const r=await run('INSERT INTO faq(question,answer) VALUES(?,?)',[question,answer]);res.json({id:r.lastID});}
  catch(e){res.status(500).json({error:e.message});}
});
router.put('/faq/:id', async (req,res) => {
  const {question,answer,active}=req.body;
  try{await run('UPDATE faq SET question=?,answer=?,active=? WHERE id=?',[question,answer,active?1:0,req.params.id]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});
router.delete('/faq/:id', async (req,res) => {
  try{await run('DELETE FROM faq WHERE id=?',[req.params.id]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});

router.get('/seo', async (req,res) => {
  try{res.json(await all('SELECT * FROM seo'));}catch(e){res.status(500).json({error:e.message});}
});
router.post('/seo', async (req,res) => {
  const {page,title,description,keywords}=req.body;
  try{
    await run('INSERT OR REPLACE INTO seo(page,title,description,keywords,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)',[page||'/',title||'',description||'',keywords||'']);
    logAction('seo_update',`SEO для ${page}`,req);res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/stats', async (req,res) => {
  try{
    const days=parseInt(req.query.days)||30;
    const from=new Date(Date.now()-days*86400000).toISOString().split('T')[0];
    const [byDay,byPage,byDevice,byReferer]=await Promise.all([
      all("SELECT date(created_at) d,COUNT(DISTINCT session_id) c FROM visits WHERE date(created_at)>=? GROUP BY d ORDER BY d",[from]),
      all("SELECT page,COUNT(*) c FROM visits WHERE date(created_at)>=? GROUP BY page ORDER BY c DESC LIMIT 10",[from]),
      all("SELECT device,COUNT(*) c FROM visits WHERE date(created_at)>=? GROUP BY device",[from]),
      all("SELECT referer,COUNT(*) c FROM visits WHERE date(created_at)>=? AND referer!='' GROUP BY referer ORDER BY c DESC LIMIT 10",[from]),
    ]);
    res.json({byDay,byPage,byDevice,byReferer});
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/calculator', async (req,res) => {
  try{res.json(await all('SELECT * FROM calculator'));}catch(e){res.status(500).json({error:e.message});}
});
router.post('/calculator', async (req,res) => {
  try{
    for(const [id,value] of Object.entries(req.body)) await run('UPDATE calculator SET value=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[parseFloat(value)||0,id]);
    logAction('calculator_update','Коэффициенты обновлены',req);res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/log', async (req,res) => {
  try{res.json(await all('SELECT * FROM admin_log ORDER BY created_at DESC LIMIT 100'));}
  catch(e){res.status(500).json({error:e.message});}
});

router.get('/backup',(req,res)=>{
  const dbPath=path.join(__dirname,'..','db','mebel.db');
  if(!fs.existsSync(dbPath)) return res.status(404).json({error:'БД не найдена'});
  logAction('backup','Скачан бэкап',req);
  res.download(dbPath,`backup_${new Date().toISOString().split('T')[0]}.db`);
});

async function sendEmail({name,phone,message}){
  if(!process.env.SMTP_USER||!process.env.NOTIFY_EMAIL) return;
  const t=nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.gmail.com',port:587,secure:false,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
  await t.sendMail({from:process.env.SMTP_USER,to:process.env.NOTIFY_EMAIL,subject:'🛋️ Новая заявка',text:`Имя: ${name}\nТелефон: ${phone}\nСообщение: ${message}`});
}

module.exports = router;
