// Synthetic CPU-bound child to verify the external watchdog can terminate it.
process.once('message',()=>{while(true){Math.sqrt(Math.random());}});
