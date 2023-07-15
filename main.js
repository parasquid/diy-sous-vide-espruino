const SCL = D20;
const SDA = D19;
const ROT_CLK = D16;
const ROT_DT = D15;
const ROT_SW = D14;
const OW_DATA = D11;

pinMode(ROT_CLK, "input");
pinMode(ROT_DT, "input");
pinMode(ROT_SW, "input_pullup");

var state = {
  led: true,
  currentTemp: 0,
  prevTemp: 0,
  setTemp: 0,
  offset: 53,
  isRelayOn: false,
  isRunning: false,
  dirty: false,
  relayOffCommand: 15559956,
  kp: 1,
  ki: 0,
  kd: 4,
  lastError: 0,
  integral: 0,
  derivative: 0,
};

function start() {
  // write some text
  g.clear();
  g.setFontVector(10);
  g.drawString("Let's", 0, 0); // 40px high in red
  g.setFontVector(20);
  g.drawString("Cook!", 40, 40); // 60px high in green
  // write to the screen
  g.flip();
}

I2C1.setup({ scl: SCL, sda: SDA, bitrate: 10000000 });
var g = require("SSD1306").connect(I2C1, start);

function getActualSetTemp(temp, offset) {
  // "jit";
  return Math.floor(temp) + offset;
}

function drawState(display, obj) {
  // "jit";
  const size = 8;
  const dblSize = size * 2;
  var relayText;
  if (obj.isRunning) {
    if (obj.isRelayOn) relayText = "on";
    else relayText = "off";
  } else relayText = "paused";

  const line1 = "cur: " + obj.currentTemp;
  const line2 = "set: " + getActualSetTemp(obj.setTemp, obj.offset);
  const line3 = "pid: " + obj.pidOutput;
  const line4 = "relay: " + relayText;

  display.clear();
  display.setFontVector(dblSize);
  display.drawString(line1, 0, size * 0);
  display.drawString(line2, 0, size * 2);
  display.setFontVector(size);
  display.drawString(line3, 0, size * 5);
  display.drawString(line4, 0, size * 6);
  display.flip();
  // console.log(state);
}

function updateStateTask() {
  if (state.dirty) {
    drawState(g, state);
    state.dirty = false;
  }
}

function ledTask() {
  // "jit";
  state.led = !state.led;
  digitalWrite(LED1, state.led);
}

function getTempCallback(temp) {
  // "jit";
  if (temp) state.currentTemp = temp;
  if (state.currentTemp != state.prevTemp) state.dirty = true;
}

function buttonTask() {
  "compiled";
  state.isRunning = !state.isRunning;
  // if (state.isRunning) sw.send(state.relayOffCommand + 8, 24);
  // else sw.send(state.relayOffCommand, 24);
  state.dirty = true;
  updateStateTask();
}
setWatch(buttonTask, ROT_SW, {
  repeat: true,
  edge: "rising",
  debounce: 25,
  ieq: true,
});

var a0 = 0;
var c0 = 0;
function handler() {
  "compiled";
  var a = ROT_DT.read();
  var b = ROT_CLK.read();
  if (a != a0) {
    // A changed
    a0 = a;
    if (b != c0) {
      c0 = b;
      var incr = a == b ? 1 : -1;
      encoderTask(incr);
    }
  }
}
setWatch(handler, ROT_DT, { repeat: true, edge: "both", irq: true });

function encoderTask(direction) {
  state.setTemp += direction;
  state.dirty = true;
}

function pid(stateObj) {
  // "jit";
  const dt = getTime() - stateObj.lastTime;
  stateObj.lastTime = getTime();

  error =
    getActualSetTemp(stateObj.setTemp, stateObj.offset) - stateObj.currentTemp;
  stateObj.integral = stateObj.integral + error * dt;
  stateObj.derivative = (error - stateObj.lastError) / dt;

  stateObj.lastError = error;
  p_term = stateObj.kp * stateObj.lastError;
  i_term = stateObj.ki * stateObj.integral;
  d_term = stateObj.kd * stateObj.derivative;

  output = p_term + i_term + d_term;
  stateObj.pidOutput = output;

  return stateObj;
}

function pidTask() {
  if (state.isRunning) {
    state = pid(state);
    state.dirty = true;
  } else {
    // also pause the error correction
    state.lastTime = getTime();
  }
}

var busy = false;
var gatt, characteristic;
function sonoffConnect() {
  if (busy) {
    digitalPulse(LED1, 1, [10, 200, 10, 200, 10]);
    return;
  }
  busy = true;
  NRF.requestDevice({ filters: [{ name: "Sonoff BLE" }] })
    .then(function (device) {
      console.log("Found");
      digitalPulse(LED1, 1, 10);
      return device.gatt.connect();
    })
    .then(function (g) {
      console.log("Connected");
      gatt = g;
      digitalPulse(LED1, 1, 10);
      return gatt.getPrimaryService("1815"); // Automation IO
    })
    .then(function (service) {
      return service.getCharacteristic("2AE2"); // Boolean
    })
    .then(function (c) {
      console.log("Got Characteristic");
      characteristic = c;
      c.writeValue([0x00]).then(function () {
        busy = false;
      });
    })
    .catch(function (e) {
      digitalPulse(LED1, 1, 10);
      console.log("ERROR", e);
      busy = false;
    });
}

function switchRelayOff() {
  // "jit";
  //sw.send(state.relayOffCommand, 24);
  busy = true;
  characteristic.writeValue([0x00]).then(function () {
    busy = false;
  });
}

function switchRelayOn() {
  // "jit";
  //sw.send(state.relayOffCommand + 8, 24);
  busy = true;
  characteristic.writeValue([0x01]).then(function () {
    busy = false;
  });
}

function relayTask() {
  if (state.isRunning) {
    if (state.pidOutput < 0) {
      state.isRelayOn = switchRelayOff();
    } else {
      state.isRelayOn = switchRelayOn();
    }
  }
}

var ow = new OneWire(OW_DATA);
var sensor = require("DS18B20").connect(ow);

// set the relay off when we start
sonoffConnect();

setInterval(updateStateTask, 200);
setInterval(function () {
  sensor.getTemp(getTempCallback);
  pidTask();
  ledTask();
  updateStateTask();
}, 1000);
setInterval(relayTask, 1000);
