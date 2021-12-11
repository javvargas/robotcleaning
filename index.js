const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", 
    //origin: "http://172.17.74.231:3000", // CHANGE WITH YOUR SERVER CONFIG 
    //origin: "https://avidbots.quannto.com/", // CHANGE WITH YOUR SERVER CONFIG 
    methods: ["GET", "POST"]
  }
})

/* Block status reference
  clean space: 0
  dirty space: 1
  wall: 2
  robot: 3
*/

let map = [];
let curPos = [];
var area;
let moves = 0;
let isCleaning = false;
let isSearching = false;
let isFinish = false;
let findDirt = [];
let interval;

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // Receive raw map
  socket.on('raw_map', (data) => {
    socket.join(data);
    console.log(`Id: ${socket.id} | Raw Map: \n${data}`);
    socket.emit('setup_map', makeMap(data));
  })

  // Start cleaning
  socket.on('start', (data, drawMap) => {
    curPos = data;
    map = drawMap;
    start();
  })

  // Emit update every 200ms
  setInterval(function(){
    if (isCleaning === true) {
      socket.emit('update_data', setData()); 
    }
  }, 200);


  // Disconect
  socket.on("disconnect", () => {
    console.log("User Disconected", socket.id)
    clearInterval(interval);
  })
})

server.listen(process.env.PORT || 5000, () => {
  console.log('SERVER RUNNING');
})




// Create the initial map from the rawMap input
const makeMap = (rawMap) => {
  let mapInit = rawMap.trim().replaceAll('#', 2).replaceAll(' ', 1).split('\n');
  let finalMap = [];
  mapInit.map((value, row) => {
    let transform = value.split('');
    finalMap[row] = transform.map((x) => parseInt(x));
  })
  map = finalMap;
  area = calcArea();
  return {'map': finalMap};
}

// Set data to send
const setData = () => {

  let areaPercent = 0;
  if (area[0] > 0) {
    if (area[1] == undefined) {
      area[1] = 0;
    }
    areaPercent = ((area[0] * 100) / (area[0] + area[1])).toFixed(0);
  }

  let time = (moves / 5).toFixed(0);
  let productivity = 0;
  if (moves > 0) {
    productivity = (area[0] / time).toFixed(2);
  }
  return {'map': map, 'areaCover': area[0] , 'areaPercent': areaPercent, 'productivity': productivity, 'time': time, 'isFinish': isFinish };
}

// Calculate areas per blocks
const calcArea = (clear) => {
  const allArea = {};
  for (row in map) {
    for (num of map[row]) {
      allArea[num] = allArea[num] ? allArea[num] + 1 : 1;
    }
  }
  if (!allArea[1] && isCleaning) {
    isFinish = true;
    findDirt = [];
    isSearching = false;
    clearInterval(interval);
    var f = setInterval(function(){
      isCleaning = false;
      clearInterval(f);
    }, 1000);
  }

  return allArea;
}

// Clean all the area
const cleanArea = () => {
  let clean = [];
  map.map((row, index1) => {
    row.map((col, index2) => {
      if (col === 3) {
        map[index1][index2] = 0;
      }
    })
  }) 
}

// Start cleaning
const start = () => {
  console.log('START CLEANING');
  isFinish = false;
  isCleaning = true;

  var i = setInterval(function(){
    moves++;
    detectDirt();

    if (isFinish) {
        clearInterval(i);
    }
  }, 200);
}

// Move robot
const moveRobot = (x, y) => {
  map[x][y] = 3
  map[curPos[0]][curPos[1]] = 0
  curPos = [x, y];
  area = calcArea();
}

// Move robot seaching
const moveRobotSearch = (x, y) => {
  if (neighbor([x, y], curPos)) {
    map[curPos[0]][curPos[1]] = 0;
  } 
  curPos = [x, y];
  area = calcArea();
}

// Clean the board
const detectDirt = () => {
  if (map[curPos[0]-1][curPos[1]] === 1) { // north
    moveRobot(curPos[0]-1, curPos[1])
    isSearching = false;
    findDirt = [];
  } else if (map[curPos[0]][curPos[1]+1] === 1) { // east
    moveRobot(curPos[0], curPos[1]+1)
    isSearching = false;
    findDirt = [];
  } else if (map[curPos[0]+1][curPos[1]] === 1) { // south
    moveRobot(curPos[0]+1, curPos[1])
    isSearching = false;
    findDirt = [];
  } else if  (map[curPos[0]][curPos[1]-1] === 1) { // west
    moveRobot(curPos[0], curPos[1]-1)
    isSearching = false;
    findDirt = [];
  } else {

    if (isSearching === false) {
      searchDirt()
    } else {

      console.log(JSON.stringify(findDirt[0]) , curPos, 'tic')  

      try {
        findDirt[0].forEach((e) => {
          moveRobotSearch(e[0], e[1]);
        })

        cleanArea();
        map[curPos[0]][curPos[1]] = 3;

        findDirt.shift();
        findDirt = findDirt;
      } catch(err) {
        isFinish = true;
        findDirt = [];
        isSearching = false;
        clearInterval(interval);
        
        var f = setInterval(function(){
          isCleaning = false;
          clearInterval(f);
        }, 4000);

      }
    }
  } 
}

// is neighbor
const neighbor = (e, mem) => {
  if (e[0] === mem[0]-1 && e[1] === mem[1]) { // north
    return true;
  }
  if (e[0] === mem[0]+1 && e[1] === mem[1]) { // south
    return true;
  }
  if (e[0] === mem[0] && e[1] === mem[1]-1) { // west
    return true;
  }
  if (e[0] === mem[0] && e[1] === mem[1]+1) { // west
    return true;
  }
  return false;
}

// Find dirt in the map
const searchDirt = () => {
  
  let grassfire = [];
  let count = 0;
  let numCal = calcArea();
  let mem = [];
  grassfire.push([curPos]);

  
  do {
    let temp = [];
    grassfire[count].forEach(e => {
      if (north(e)) {
        let nor = north(e)[0];
        if (!mem.includes(nor.join(','))) {
          if (exist(temp, nor)) {
            temp.push(nor);
          }
          mem.push(nor.join(','))
        } 
      }
      if (east(e)) {
        let est = east(e)[0];
        if (!mem.includes(est.join(','))) {
          if (exist(temp, est)) {
            temp.push(est);
          }
          mem.push(est.join(','))
        }
      }
      if (south(e)) {
        let sur = south(e)[0];
        if (!mem.includes(sur.join(','))) {
          if (exist(temp, sur)) {
            temp.push(sur);
          }
          mem.push(sur.join(','))
        }
      }
      if (west(e)) {
        let wes = west(e)[0];
        if (!mem.includes(wes.join(','))) {
          if (exist(temp, wes)) {
            temp.push(wes);
          }
          mem.push(wes.join(','))
        }
      }
    });

    count++;

    grassfire.push(temp);

  } while (count < 50 );


  

  isSearching = true;
  
  console.log(JSON.stringify(grassfire), 'FINAL')

  grassfire.shift();
  findDirt = grassfire;
}


// Check if exist in list
const exist = (arr, item) => {
  arr.forEach((e) => {
    if (e.join(',') === item.join(',')) {
      return false;
    }
  })
  return true;
}


  // Evaluate north position
  const north = (pos) => {
    if (map[pos[0]-1][pos[1]] <= 1) {
      return [[pos[0]-1, pos[1]], map[pos[0]-1][pos[1]]];
    }
    return false;
  }
  
  // Evaluate east position
  const east = (pos) => {
    if (map[pos[0]][pos[1]+1] <= 1) {
      return [[pos[0], pos[1]+1], map[pos[0]][pos[1]+1]];
    }
    return false;
  }

  // Evaluate south position
  const south = (pos) => {
    if (map[pos[0]+1][pos[1]] <= 1) {
      return [[pos[0]+1, pos[1]], map[pos[0]+1][pos[1]]];
    }
    return false;
  }

  // Evaluate west position
  const west = (pos) => {
    if (map[pos[0]][pos[1]-1] <= 1) {
      return [[pos[0], pos[1]-1], map[pos[0]][pos[1]-1]];
    }
    return false;
  }