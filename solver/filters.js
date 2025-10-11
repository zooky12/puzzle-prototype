// solver/filters.js
function isOneEditApart(a, b) {
  if (a===b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la-lb) > 1) return false;
  let i=0,j=0, edits=0;
  while (i<la && j<lb) {
    if (a[i]===b[j]) { i++; j++; continue; }
    if (++edits>1) return false;
    if (la>lb) i++;
    else if (lb>la) j++;
    else { i++; j++; }
  }
  if (i<la || j<lb) edits++;
  return edits===1;
}

function editDistanceAtMost(a,b,limit) {
  if (a===b) return true;
  let la=a.length, lb=b.length;
  if (Math.abs(la-lb)>limit) return false;
  if (la>lb){ const t=a; a=b; b=t; la=a.length; lb=b.length; }
  let prev=new Array(lb+1), curr=new Array(lb+1);
  for (let j=0;j<=lb;j++) prev[j]=j;
  for (let i=1;i<=la;i++) {
    curr[0]=i;
    const jStart=Math.max(1,i-limit), jEnd=Math.min(lb,i+limit);
    for (let j=1;j<jStart;j++) curr[j]=limit+1;
    let rowMin=curr[jStart-1];
    for (let j=jStart;j<=jEnd;j++) {
      const cost = (a[i-1]===b[j-1]) ? 0 : 1;
      curr[j] = Math.min(prev[j]+1, curr[j-1]+1, prev[j-1]+cost);
      if (curr[j]<rowMin) rowMin=curr[j];
    }
    for (let j=jEnd+1;j<=lb;j++) curr[j]=limit+1;
    if (rowMin>limit) return false;
    const t=prev; prev=curr; curr=t;
  }
  return prev[lb] <= limit;
}

export function filterNearDuplicates(solutions, maxEdits=2) {
  if (!Array.isArray(solutions)||solutions.length===0) return solutions;
  const sorted = solutions.slice().sort((a,b)=> a.length-b.length || a.moves.localeCompare(b.moves));
  const keep=[];
  for (const s of sorted) {
    const clash = keep.some(k=>{
      const dlen = s.length - k.length;
      if (dlen<0 || dlen>maxEdits) return false;
      if (dlen===1 && isOneEditApart(s.moves,k.moves)) return true;
      return editDistanceAtMost(s.moves, k.moves, maxEdits);
    });
    if (!clash) keep.push(s);
  }
  return keep;
}
