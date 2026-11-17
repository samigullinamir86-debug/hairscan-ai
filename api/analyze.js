export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Метод не поддерживается'});
 try{
  const {image}=req.body||{};
  if(typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(image)||image.length>9000000)return res.status(400).json({error:'Нужно фото JPG/PNG/WEBP до 6 МБ'});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(503).json({error:'Добавьте GEMINI_API_KEY в настройках Vercel.'});
  const match=image.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  const mime=match[1]==='jpeg'?'image/jpeg':'image/'+match[1];
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
  let response;
  try{
   response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',{
    method:'POST',signal:controller.signal,
    headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({
     contents:[{role:'user',parts:[
      {text:'Опиши на русском в 2–4 коротких предложениях только видимые особенности линии роста волос и видимость кожи головы на фото. Не ставь диагноз и не определяй стадию облысения. Если фото не подходит, объясни почему. Не делай выводов о возрасте, поле или здоровье. Не рекомендуй лечение.'},
      {inline_data:{mime_type:mime,data:match[2]}}
     ]}],
     generationConfig:{maxOutputTokens:300,temperature:0.2}
    })
   });
  }finally{clearTimeout(timer)}
  if(!response.ok){
   const err=await response.json().catch(()=>({}));
   const msg=response.status===429?'Бесплатный лимит Gemini исчерпан. Попробуйте позже.':response.status===403?'Gemini API недоступен для этого проекта или региона.':response.status===400?'Gemini отклонил запрос или ключ.': 'Сервис Gemini временно недоступен ('+response.status+').';
   return res.status(502).json({error:msg});
  }
  const data=await response.json();
  const result=(data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join(' ').trim();
  if(!result)return res.status(502).json({error:'Модель не вернула описание изображения.'});
  return res.status(200).json({result:result.slice(0,1500)});
 }catch(e){return res.status(500).json({error:e?.name==='AbortError'?'Анализ занял слишком много времени.':'Не удалось обработать фото.'})}
}