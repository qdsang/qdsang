var host = (document.domain || '127.0.0.1')
host = '172.16.50.123';
var port = 8080;

var ws = null; // WebSocket 对象
var heartbeatTimer = null; // 心跳定时器
var isReconnect = true; // 是否自动重连

// 创建 WebSocket 连接
// @auth https://so.csdn.net/so/ai
function createWebSocket() {
    var wsUrl = 'ws://' + host + ':' + port;
    if ("WebSocket" in window) {
        ws = new WebSocket(wsUrl);

        // WebSocket 打开事件
        ws.onopen = function () {
            console.log("WebSocket 已连接");

            // 开始心跳定时器
            startHeartbeat();
        };

        // WebSocket 收到消息事件
        ws.onmessage = function (evt) {
            console.log("WebSocket 收到消息：" + evt.data);
        };

        // 发生错误回调
        ws.onerror = function (e) {
            console.log('WebSocket错误:', e);
        }

        // WebSocket 关闭事件
        ws.onclose = function () {
            console.log("WebSocket 已关闭");

            // 停止心跳定时器
            stopHeartbeat();

            // 断线后自动重连
            if (isReconnect) {
                setTimeout(function () {
                    console.log("WebSocket 尝试重新连接");
                    createWebSocket();
                }, 3 * 1000);
            }
        };
    } else {
        console.log("该浏览器不支持 WebSocket");
    }
}

// 发送消息
function sendMessage(message) {
    if (ws != null && ws.readyState == WebSocket.OPEN) {
        ws.send(message);
        console.log("WebSocket 发送消息：" + message);
    } else {
        console.log("WebSocket 连接没有建立或已关闭");
    }
}

// 开始心跳定时器
function startHeartbeat(interval) {
    interval = interval || 30;
    heartbeatTimer = setInterval(function () {
        sendMessage("heartbeat");
    }, interval * 1000);
}

// 停止心跳定时器
function stopHeartbeat() {
    clearInterval(heartbeatTimer);
}

// 启动 WebSocket 连接
createWebSocket();

function wsSend(json) {
    sendMessage(JSON.stringify(json));
}

export {createWebSocket, wsSend};
