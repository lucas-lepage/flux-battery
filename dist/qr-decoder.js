// Local high-resolution fallback. No image or video leaves the browser.
(function(root){
 function decodeCanvas(canvas){
  if(typeof root.jsQR!=='function')return null;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,canvas.width,canvas.height);
  return root.jsQR(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'})?.data||null;
 }
 async function decodeFile(file){
  const url=URL.createObjectURL(file),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Image non prise en charge. Utilisez un PNG ou JPEG.'));image.src=url;});
   const canvas=document.createElement('canvas');
   // Full-resolution first for dense passports; also try a smaller scale for large photos.
   for(const max of [2400,1400,900]){const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const raw=decodeCanvas(canvas);if(raw)return raw;if(scale===1)break;}
   return null;
  }finally{URL.revokeObjectURL(url);}
 }
 root.FluxQRDecoder={decodeCanvas,decodeFile};
})(window);
