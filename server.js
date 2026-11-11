const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const path=require('path');
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*'}});
app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(req,res)=>res.json({ok:true}));
const rooms=new Map(); // code -> Set(socketId)
io.on('connection',(socket)=>{
  socket.on('create-room',(code)=>{
    if(!code) return;
    socket.join(code); socket.data.room=code; socket.data.isHost=true;
    if(!rooms.has(code)) rooms.set(code,new Set());
    rooms.get(code).add(socket.id);
    io.to(code).emit('viewers', Math.max(0, rooms.get(code).size-1));
  });
  socket.on('join-room',(code)=>{
    if(!rooms.has(code)){ socket.emit('room-not-found'); return; }
    socket.join(code); socket.data.room=code; socket.data.isHost=false;
    rooms.get(code).add(socket.id);
    socket.to(code).emit('viewer-joined', socket.id);
    io.to(code).emit('viewers', Math.max(0, rooms.get(code).size-1));
  });
  socket.on('offer',({to,offer})=> io.to(to).emit('offer',{from:socket.id,offer}));
  socket.on('answer',({to,answer})=> io.to(to).emit('answer',{from:socket.id,answer}));
  socket.on('ice-candidate',({to,candidate})=> io.to(to).emit('ice-candidate',{from:socket.id,candidate}));
  socket.on('disconnect',()=>{
    const code=socket.data.room; if(!code||!rooms.has(code)) return;
    rooms.get(code).delete(socket.id);
    if(rooms.get(code).size===0) rooms.delete(code);
    else io.to(code).emit('viewers', Math.max(0, rooms.get(code).size-1));
  });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('Serafim Transmissoes na porta '+PORT));
// TURN: configure no Render com TURN_URL, TURN_USERNAME, TURN_CREDENTIAL
// O frontend usa STUN publico + o servidor de sinalizacao. Para TURN completo,
// adicione as variaveis no Render como voce ja fez com o Metered.
