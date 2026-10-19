import {useCallback,useEffect,useState} from 'react';

// Offer inputs have minute precision. Refresh at each minute boundary and
// immediately when a sleeping/background POS is brought back into use.
export function usePromotionTime() {
  const [now,setNow]=useState(()=>Date.now());
  const refresh=useCallback(()=>setNow(Date.now()),[]);
  useEffect(()=>{
    let timer;
    const schedule=()=>{timer=window.setTimeout(()=>{refresh();schedule();},60000-Date.now()%60000+20);};
    const resume=()=>{refresh();window.clearTimeout(timer);schedule();};
    schedule();window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{window.clearTimeout(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[refresh]);
  return [now,refresh];
}
