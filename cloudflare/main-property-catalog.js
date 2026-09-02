import baseWorker from "./main-performance.js";

const ORIGIN=env=>env.FRONTEND_ORIGIN||"https://britsingh20-source.github.io";
const cors=env=>({"access-control-allow-origin":ORIGIN(env),"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,authorization","cache-control":"no-store"});
const json=(data,status=200,env={})=>new Response(JSON.stringify(data),{status,headers:{...cors(env),"content-type":"application/json; charset=utf-8"}});
const bearer=request=>{const value=request.headers.get("authorization")||"";return value.startsWith("Bearer ")?value.slice(7):"";};
const clean=value=>String(value??"").trim();

async function editorSession(request,env){
  const token=bearer(request);if(!token)return null;
  const row=await env.DB.prepare("SELECT user_label,last_activity_at,active FROM telecaller_sessions WHERE token=? AND active=1").bind(token).first();
  if(!row||!["Administrator","Director"].includes(row.user_label))return null;
  const last=Date.parse(String(row.last_activity_at||"").replace(" ","T")+"Z");
  if(!Number.isFinite(last)||Date.now()-last>10*60*1000)return null;
  await env.DB.prepare("UPDATE telecaller_sessions SET last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(token).run();return row;
}
async function directorSession(request,env){const session=await editorSession(request,env);return session?.user_label==="Director"?session:null;}
function slug(value){return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"property";}
function parseCoordinates(value){const parts=clean(value).split(",").map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts:null;}
async function listProperties(env){
  const properties=(await env.DB.prepare("SELECT * FROM properties WHERE active=1 ORDER BY updated_at DESC").all()).results||[];
  const images=(await env.DB.prepare("SELECT property_id,slot,object_key,original_name FROM property_images ORDER BY id").all()).results||[];
  return properties.map(p=>({id:p.id,title:p.title,type:p.property_kind,bedrooms:p.bedrooms||"",address:p.address,price:p.price,landArea:p.land_area||"",builtUpArea:p.built_up_area||"",facing:p.facing||"",approval:p.approval||"",road:p.road||"",coordinates:[p.longitude,p.latitude],features:JSON.parse(p.features_json||"[]"),tour:images.filter(i=>i.property_id===p.id).map(i=>({label:i.slot,url:`/api/property-media/${encodeURIComponent(i.object_key)}`,alt:i.original_name||`${i.slot} image`}))}));
}
async function saveProperty(request,env){
  const session=await editorSession(request,env);if(!session)return json({error:"Director or Administrator session required"},401,env);
  const form=await request.formData(),kind=clean(form.get("type"));
  if(!["Plot","Villa"].includes(kind))return json({error:"Property type must be Plot or Villa"},422,env);
  const title=clean(form.get("title")),address=clean(form.get("address")),price=clean(form.get("price")),coordinates=parseCoordinates(form.get("coordinates"));
  if(!title||!address||!price||!coordinates)return json({error:"Title, location, price and valid Longitude, Latitude are required"},422,env);
  const id=clean(form.get("id"))||`${slug(title)}-${Date.now().toString(36)}`;
  const existing=await env.DB.prepare("SELECT id FROM properties WHERE id=?").bind(id).first();
  const existingPoster=existing&&await env.DB.prepare("SELECT 1 ok FROM property_images WHERE property_id=? AND slot='Front Poster'").bind(id).first();
  const incomingPoster=form.get("image_Front Poster");
  if(!existingPoster&&(!(incomingPoster instanceof File)||!incomingPoster.size))return json({error:"A Front Poster image is required"},422,env);
  await env.DB.prepare(`INSERT INTO properties(id,title,property_kind,bedrooms,address,price,land_area,built_up_area,facing,approval,road,longitude,latitude,features_json,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,property_kind=excluded.property_kind,bedrooms=excluded.bedrooms,address=excluded.address,price=excluded.price,land_area=excluded.land_area,built_up_area=excluded.built_up_area,facing=excluded.facing,approval=excluded.approval,road=excluded.road,longitude=excluded.longitude,latitude=excluded.latitude,features_json=excluded.features_json,active=1,updated_at=CURRENT_TIMESTAMP`).bind(id,title,kind,clean(form.get("bedrooms"))||null,address,price,clean(form.get("landArea"))||null,clean(form.get("builtUpArea"))||null,clean(form.get("facing"))||null,clean(form.get("approval"))||null,clean(form.get("road"))||null,coordinates[0],coordinates[1],JSON.stringify(clean(form.get("features")).split(",").map(x=>x.trim()).filter(Boolean)),session.user_label).run();
  let uploaded=0;
  for(const [key,value] of form.entries()){
    if(!key.startsWith("image_")||!(value instanceof File)||!value.size)continue;
    if(value.size>1536*1024)return json({error:`${value.name} is too large after preparation`},422,env);
    if(!value.type.startsWith("image/"))return json({error:`${value.name} is not an image`},422,env);
    const slot=key.slice(6),old=await env.DB.prepare("SELECT object_key FROM property_images WHERE property_id=? AND slot=?").bind(id,slot).first();
    const ext=(value.name.split(".").pop()||"jpg").replace(/[^a-z0-9]/gi,"").slice(0,5)||"jpg",objectKey=`${id}/${slug(slot)}-${crypto.randomUUID()}.${ext}`;
    const bytes=await value.arrayBuffer();
    await env.DB.prepare("INSERT INTO property_images(property_id,slot,object_key,image_data,content_type,original_name) VALUES(?,?,?,?,?,?) ON CONFLICT(property_id,slot) DO UPDATE SET object_key=excluded.object_key,image_data=excluded.image_data,content_type=excluded.content_type,original_name=excluded.original_name,created_at=CURRENT_TIMESTAMP").bind(id,slot,objectKey,bytes,value.type,value.name).run();
    uploaded++;
  }
  if(session.user_label==="Director"){
    for(const type of ["owner","manager","builder"]){
      const name=clean(form.get(`${type}_name`)),phone=clean(form.get(`${type}_phone`));
      if(phone)await env.DB.prepare("INSERT INTO property_contacts(property_id,contact_type,contact_name,contact_phone) VALUES(?,?,?,?) ON CONFLICT(property_id,contact_type) DO UPDATE SET contact_name=excluded.contact_name,contact_phone=excluded.contact_phone,updated_at=CURRENT_TIMESTAMP").bind(id,type,name||null,phone).run();
      else await env.DB.prepare("DELETE FROM property_contacts WHERE property_id=? AND contact_type=?").bind(id,type).run();
    }
  }
  return json({ok:true,id,uploaded,property:(await listProperties(env)).find(p=>p.id===id)},200,env);
}

export default {async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,"")||"/";
  if(request.method==="OPTIONS"&&(path==="/api/properties"||path.startsWith("/api/properties/")||path.startsWith("/api/property-media/")))return new Response(null,{headers:cors(env)});
  if(request.method==="GET"&&path==="/api/properties")return json({properties:await listProperties(env)},200,env);
  const contactsMatch=path.match(/^\/api\/properties\/([^/]+)\/contacts$/);
  if(request.method==="GET"&&contactsMatch){
    if(!await directorSession(request,env))return json({error:"Director session required"},403,env);
    const contacts=(await env.DB.prepare("SELECT contact_type,contact_name,contact_phone FROM property_contacts WHERE property_id=? ORDER BY contact_type").bind(decodeURIComponent(contactsMatch[1])).all()).results||[];
    return json({contacts},200,env);
  }
  if(request.method==="POST"&&path==="/api/properties")return saveProperty(request,env);
  if(request.method==="GET"&&path.startsWith("/api/property-media/")){
    const key=decodeURIComponent(path.slice("/api/property-media/".length)),object=await env.DB.prepare("SELECT image_data,content_type FROM property_images WHERE object_key=?").bind(key).first();if(!object?.image_data)return new Response("Not found",{status:404,headers:cors(env)});
    const headers=new Headers(cors(env));headers.set("content-type",object.content_type||"image/jpeg");headers.set("cache-control","public,max-age=31536000,immutable");return new Response(object.image_data,{headers});
  }
  return baseWorker.fetch(request,env,ctx);
}};
