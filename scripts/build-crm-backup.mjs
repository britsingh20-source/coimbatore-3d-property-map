import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const inputDir=process.argv[2]||'backup-data';
const output=process.argv[3]||'CRM_Backup.xlsx';

function readRows(name){
  const file=path.join(inputDir,`${name}.json`);
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  function find(v){
    if(Array.isArray(v)){
      for(const item of v){const hit=find(item);if(hit)return hit;}
      return null;
    }
    if(v&&typeof v==='object'){
      if(Array.isArray(v.results))return v.results;
      if(v.result&&Array.isArray(v.result.results))return v.result.results;
      for(const value of Object.values(v)){const hit=find(value);if(hit)return hit;}
    }
    return null;
  }
  return find(raw)||[];
}

function sheetFromRows(rows){
  const ws=rows.length?XLSX.utils.json_to_sheet(rows):XLSX.utils.aoa_to_sheet([['No records']]);
  if(rows.length){
    const keys=Object.keys(rows[0]);
    ws['!cols']=keys.map(key=>({wch:Math.min(45,Math.max(key.length+2,...rows.slice(0,400).map(r=>String(r?.[key]??'').length+2)))}));
    ws['!autofilter']={ref:`A1:${XLSX.utils.encode_col(keys.length-1)}1`};
    ws['!freeze']={xSplit:0,ySplit:1};
  }
  return ws;
}

const data={
  Customers:readRows('leads'),
  Activities:readRows('activities'),
  Area_Master:readRows('areas'),
  Catchments:readRows('catchments'),
  Area_Aliases:readRows('aliases'),
  Priority_Config:readRows('priority')
};

const generatedAt=new Date().toISOString();
const summary=[
  {Field:'Generated at (UTC)',Value:generatedAt},
  {Field:'Customers',Value:data.Customers.length},
  {Field:'Activities',Value:data.Activities.length},
  {Field:'Areas',Value:data.Area_Master.length},
  {Field:'Catchments',Value:data.Catchments.length},
  {Field:'Area aliases',Value:data.Area_Aliases.length}
];

if(!data.Customers.length)throw new Error('Backup aborted: Customers sheet is empty.');

const wb=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb,sheetFromRows(summary),'Backup Summary');
for(const [name,rows] of Object.entries(data))XLSX.utils.book_append_sheet(wb,sheetFromRows(rows),name.slice(0,31));
XLSX.writeFile(wb,output,{compression:true});
console.log(JSON.stringify({ok:true,output,customers:data.Customers.length,activities:data.Activities.length,generated_at:generatedAt}));
