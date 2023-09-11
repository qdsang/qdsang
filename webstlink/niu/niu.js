import {elf_json} from './elf.js';
// import {wsSend} from './socket.js';

Date.prototype.format = function(fmt) {
    let o = {
      "M+" : this.getMonth()+1,                 //月份
      "d+" : this.getDate(),                    //日
      "h+" : this.getHours(),                   //小时
      "m+" : this.getMinutes(),                 //分
      "s+" : this.getSeconds(),                 //秒
      "q+" : Math.floor((this.getMonth()+3)/3), //季度
      "S"  : this.getMilliseconds()             //毫秒
    };
    if(/(y+)/.test(fmt)) {
      fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));
    }
    for(let k in o) {
      if(new RegExp("("+ k +")").test(fmt)){
        fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));
      }
    }
    return fmt;
};

let monitorButton = document.querySelector("#monitor");
monitorButton.addEventListener('click', async function() {
    task_run();
});

let excelButton = document.querySelector("#excel");
excelButton.addEventListener('click', async function() {
    var str = csv.join('\n');
    var aaaa = "data:text/csv;charset=utf-8,\ufeff" + str;
    var link = document.createElement("a");
    link.setAttribute("href", aaaa);
    var date=new Date().getTime();
    var filename = 'stlink_' + (new Date()).format('yyyyMMdd_hhmmss_S');
    link.setAttribute("download", filename + ".csv");
    link.click();
});


var filed_up = {};
var task_timer;
var tasks = [
    // {key: "adc_buffer.rlA_o", cycle: 10},
    // {key: "adc_buffer.rlB_o", cycle: 10},
    {key: "adc_buffer.rlC_o", cycle: 10},

    {key: "rtU_Left.b_hallA", cycle: 10},
    {key: "rtU_Left.b_hallB", cycle: 10},
    {key: "rtU_Left.b_hallC", cycle: 10},
    {key: "rtU_Left.i_DCLink", cycle: 10},
    {key: "rtU_Left.i_phaAB", cycle: 10},
    {key: "rtU_Left.i_phaBC", cycle: 10},
    {key: "rtU_Left.r_inpTgt", cycle: 10},
    {key: "rtU_Left.z_ctrlModReq", cycle: 10},

    {key: "rtY_Left.DC_phaA", cycle: 0},
    {key: "rtY_Left.DC_phaB", cycle: 0},
    {key: "rtY_Left.DC_phaC", cycle: 0},
];

var _stat = {};
const sleep = ms => new Promise(res => setTimeout(res, ms))
 
// adc_buffer.batt1
// adc_buffer.dcl
// adc_buffer.dcl_o
// adc_buffer.rlA
// adc_buffer.rlA_o
// adc_buffer.rlB
// adc_buffer.rlB_o
// adc_buffer.rlC
// adc_buffer.rlC_o
// adc_buffer.temp


// rtU_Left.a_mechAngle
// rtU_Left.b_hallA
// rtU_Left.b_hallB
// rtU_Left.b_hallC
// rtU_Left.b_motEna
// rtU_Left.i_DCLink
// rtU_Left.i_phaAB
// rtU_Left.i_phaBC
// rtU_Left.r_inpTgt
// rtU_Left.z_ctrlModReq


// rtY_Left.DC_phaA
// rtY_Left.DC_phaB
// rtY_Left.DC_phaC
// rtY_Left.a_elecAngle
// rtY_Left.id
// rtY_Left.iq
// rtY_Left.n_mot
// rtY_Left.z_errCode


var csv = [];
function savedata() {
    var c = [];
    filed_up['time'] = +new Date();
    c.push((new Date()).format('yyyyMMdd_hhmmss_S'))
    for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        var val = filed_up[task.key];
        if (typeof val == undefined) {
            val = '';
        }
        c.push(val)
    }
    csv.push(c.join(','));
    // wsSend({payload: filed_up});
}


var task_read = [];

var elf_map = {};
for (var i = 0; i < elf_json.length; i++) {
    var item = elf_json[i];
    elf_map[item.member_key] = item;
}


function task_init() {
    for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        task_read.push(task)
    }
}

var csv_head = ['time'];
for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var member = elf_map[task.key];
    if (!member) {
        console.error(task.key);
        continue;
    }
    csv_head.push(member.member_key);
    console.log(member.member_key, member.type, member.addr, member.size);
    task_read.push(task)
}
csv.push(csv_head.join(','));
console.log(task_read);


function stat_up(key) {
    if (!_stat[key]) {
        _stat[key] = {num: 0, time: +new Date, avg: 0};
    }
    var s = _stat[key];
    s.num++;

    var t = +new Date;
    if ((t - s.time) > 1000) {
        s.avg = s.num / ((t - s.time)/ 1000);
        s.time = t;
        s.num = 0;
    }
}
function reader() {
    let memoryContents = document.getElementById("debug");
    var html = [];
    for (var key in filed_up) {
        html.push('<span class="filed-item">' + key + ': ' + filed_up[key] + '</span>')
    }
    memoryContents.innerHTML = html.join('')
}

setInterval(function(){
    console.log('stat', _stat)
    reader();
}, 200);
reader();

function type_to(member, value) {
    var type = member['type'].toLowerCase();
    var val = 0;
    if (type == 'int16_t') {
        const numArray = new Int16Array(value.buffer);
        return numArray[0];
    } else if (type == 'int8_t') {
        const numArray = new Int8Array(value.buffer);
        return numArray[0];
    } else if (type == 'uint16_t') {
        const numArray = new Uint16Array(value.buffer);
        return numArray[0];
    } else if (type == 'uint8_t') {
        const numArray = new Uint8Array(value.buffer);
        return numArray[0];
    } else {
        console.log(type);
    }
}


async function stlink_read(task) {
    var member = elf_map[task.key];
    var stlink = window.stlink;
    var key = member['member_key'];
    var addr = member['addr'];
    var size = member['size'];
    stat_up(key);
    // await sleep(1);
    // let val = parseInt(Math.random()*100);

    let memory = await stlink.read_memory(addr, size);
    let val = type_to(member, memory);
    // console.log(member['member_key'], member, memory, val);
    filed_up[key] = val;
    return val;
}

var task_index = 0;
async function task_run() {
    for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        var run = 0
        if (task.cycle == 0) {
            run = 1;
        } else if (task_index % parseInt(1000/task.cycle) == 0) {
            run = 1;
        }
        if (run) {
            var val = await stlink_read(task);
        }
    }

    // console.log(filed_up);

    savedata();
    task_index++;
    clearTimeout(task_timer);
    task_timer = setTimeout(task_run, 1);
}

console.log(filed_up)
window.stlink_run = task_run;
// task_run();


