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
