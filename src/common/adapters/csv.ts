/** RFC4180 logical records, including header/blank records; embedded newlines stay inside fields. */
export function csvRecords(input: Uint8Array | string, delimiter = ','): string[][] {
  const text=(typeof input==='string'?input:new TextDecoder().decode(input)).replace(/^\uFEFF/,'');
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false,afterQuote=false;
  for(let i=0;i<text.length;i++) {
    const char=text[i]!;
    if(quoted) {if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=char;continue;}
    if(char==='"'){if(field || afterQuote)throw new Error('Unexpected CSV quote');quoted=true;continue;}
    if(char===delimiter){row.push(field);field='';afterQuote=false;continue;}
    if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';afterQuote=false;continue;}
    if(afterQuote && !/\s/.test(char))throw new Error('Unexpected text following CSV quote');
    if(!afterQuote)field+=char;
  }
  if(quoted)throw new Error('Unterminated CSV quote');
  if(field || row.length || afterQuote){row.push(field);rows.push(row);}
  return rows;
}
export function parseCsv(input: Uint8Array | string, delimiter = ','): {headers:string[];rows:Record<string,string>[];rawRows:string[][]} {
  const raw=csvRecords(input,delimiter),headers=raw.shift()??[];
  if(new Set(headers).size!==headers.length)throw new Error('Duplicate CSV headers');
  const rawRows=raw.filter(row=>row.some(value=>value.trim()));
  const rows=rawRows.map(row=>{if(row.length!==headers.length)throw new Error('CSV field cardinality mismatch');return Object.fromEntries(headers.map((h,i)=>[h,row[i]!]));});
  return {headers,rows,rawRows};
}
