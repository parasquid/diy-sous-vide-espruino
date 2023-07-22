// aa6b
var g;
var connected = false;
function drawState() {
  if (!g) return;
  g.clear();
  // write some text
  g.drawString("Sonoff BLE!", 2, 2);
  g.drawString("", 0, 10);

  // write to the screen
  g.flip();
}

function initDisplay() {
  I2C1.setup({ scl: D45, sda: D44 });
  g = require("SSD1306").connect(I2C1, drawState, { height: 32 });
}

var on = false;
setInterval(function () {
  on = !on;
  //D47.write(on);
  LED1.write(on);
  drawState();
}, 500);

NRF.setServices({
  0x1815: {
    0x2ae2: {
      writable: true,
      maxLen: 1,
      value: [false],
      onWrite: function (evt) {
        var n = evt.data[0];
        D47.write(n);
      },
    },
  },
});

// On disconnect, turn off the relay
NRF.on("disconnect", function () {
  D47.write(false);
  g.off();
  connected = false;
});

// On connect, turn on the oled
NRF.on("connect", function () {
  setTimeout(function () {
    initDisplay();
  }, 1000);
  connected = true;
});

NRF.setAdvertising({}, { name: "Sonoff BLE" });

initDisplay();
var initOff = setInterval(function () {
  if (g) {
    clearInterval(initOff);
    if (!connected) {
      D47.write(false);
      g.clear();
      g.off();
    }
  }
}, 2000);

// var busy = false;
// var gatt, characteristic;
// function sonoffConnect() {
//   if (busy) {
//     digitalPulse(LED1, 1, [10, 200, 10, 200, 10]);
//     return;
//   }
//   busy = true;
//   NRF.requestDevice({ filters: [{ name: "Sonoff BLE" }], timeout: 1000 })
//     .then(function (device) {
//       state.lastMessage = "Found";
//       drawState(g, state);
//       digitalPulse(LED1, 1, 10);
//       return device.gatt.connect();
//     })
//     .then(function (_gatt) {
//       state.lastMessage = "Connected";
//       drawState(g, state);
//       gatt = _gatt;
//       digitalPulse(LED1, 1, 10);
//       return gatt.getPrimaryService("1815"); // Automation IO
//     })
//     .then(function (service) {
//       return service.getCharacteristic("2AE2"); // Boolean
//     })
//     .then(function (c) {
//       msg("Got Characteristic");
//       characteristic = c;
//       c.writeValue([0x00]).then(function () {
//         busy = false;
//       });
//     })
//     .catch(function (e) {
//       digitalPulse(LED1, 1, 10);
//       console.log("ERROR", e);
//       msg(e);
//       gatt = undefined;
//       busy = false;
//     });
// }


// setInterval(function () {
//   if (gatt) {
//     if (!gatt.connected) {
//       sonoffConnect();
//     }
//   } else {
//     msg("connecting to BLE");
//     sonoffConnect();
//   }
// }, 5000);


  // busy = true;
  // characteristic.writeValue([0x00]).then(function () {
  //   busy = false;
  // });
