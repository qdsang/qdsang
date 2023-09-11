from elftools.elf.elffile import ELFFile
# from elftools.dwarf.descriptions import describe_die
from pygdbmi.gdbcontroller import GdbController
from pprint import pprint

import re
import sys
if sys.version > '3':
    import queue
else:
    import Queue as queue
import threading
import contextlib
import time

# from threadpool import ThreadPool
from multiprocessing.pool import ThreadPool



def getFullTypeName(die):
    if die.attributes.get('DW_AT_name'):
        name = die.attributes.get('DW_AT_name').value
        parent = die.get_parent()
        while parent and parent.tag != 'DW_TAG_compile_unit':
            if parent.attributes.get('DW_AT_name'):
                name = parent.attributes.get('DW_AT_name').value + '::' + name
            parent = parent.get_parent()
        return name
    else:
        return None

def process_dwarf(elffile):
    struct_list = []
    if elffile.has_dwarf_info():
        dwarfinfo = elffile.get_dwarf_info()
        for CU in dwarfinfo.iter_CUs():
            for DIE in CU.iter_DIEs():

                if DIE.tag == 'DW_TAG_structure_type' or DIE.tag == 'DW_TAG_class_type':
                    
                    struct_item = {}
                    struct_item['tag'] = DIE.tag
                    struct_item['size'] = DIE.size
                    struct_item['offset'] = DIE.offset
                    struct_item['abbrev_code'] = DIE.abbrev_code
                    struct_item['path'] = DIE.get_full_path()
                    
                    
                    if DIE.attributes.get('DW_AT_name'):
                        struct_item["type_name"] = getFullTypeName(DIE)
                        
                    for key in DIE.attributes.keys():
                        struct_item[key] = DIE.attributes[key].value
                    # print()
                    print('0x%x' % DIE.offset, struct_item)
                    member_list = []

                    for child in DIE.iter_children():
                        if child.tag == 'DW_TAG_member':
                            attr = {}
                            for key in child.attributes.keys():
                                attr[key] = child.attributes[key].value
                            member_list.append(attr)
                            # print(attr)
                            print(' - ', attr['DW_AT_data_member_location'], ' ', attr['DW_AT_name'], ' ', '0x%x' % attr['DW_AT_type'])
                    struct_item["member"] = member_list
                    struct_list.append(struct_item)
                    # if "DW_AT_name" in struct_item:
                    # print(struct_item)
    return struct_list


def symbol_data(elf, sym):
    """
    Retrieve the raw bytes associated with a symbol from the elf file.
    """
    relocatable = elf['e_type'] == 'ET_REL'

    # Symbol data parameters
    addr = sym.entry.st_value
    length = sym.entry.st_size
    # Section associated with the symbol
    section = elf.get_section(sym.entry['st_shndx'])
    data = section.data()
    # Relocatable data does not appear to be shifted
    offset = addr - (0 if relocatable else section['sh_addr'])
    # Validate data extraction
    assert offset + length <= len(data)
    # Extract symbol bytes from section
    return bytes(data[offset:offset + length])

def process_symtab(elffile):
    section = elffile.get_section_by_name('.symtab')
    variable_list = []
    for symbol in section.iter_symbols():
        if symbol['st_info']['type'] == 'STT_OBJECT':
            # print(symbol.entry)
            variable_item = {}
            variable_item["name"] = symbol.name
            variable_item["st_value"] = symbol.entry.st_value
            variable_item["st_size"] = symbol.entry.st_size
            variable_item["st_shndx"] = symbol.entry.st_shndx
            variable_item["st_info_type"] = symbol.entry.st_info.type
            variable_item["st_info_bind"] = symbol.entry.st_info.bind
            variable_item["st_other_local"] = symbol.entry.st_other.local
            variable_item["st_other_visibility"] = symbol.entry.st_other.visibility
            # print('Address: 0x%x' % symbol.entry.st_value + f' , Name: {symbol.name}, Size: {symbol.entry.st_size}, Type: {symbol.entry.st_info.type}')
            variable_list.append(variable_item)
            # print(variable_item)
            # if symbol.name in ["adc_buffer"]:
            #     data = symbol_data(elffile, symbol)
            #     print(symbol.name, data)
            #     variable_item["DW_AT_decl_file"] = 17
            #     variable_item["DW_AT_decl_line"] = 297
    return variable_list

def process_key_size(gdbmi, key):
    response = gdbmi.write('print sizeof(' + key + ')', timeout_sec= 5)
    for item in response:
        if item["type"] == "console":
            tt = re.match(r'^\$(\d*) = (.*)\n$', item["payload"])
            if tt is None:
                print("size Error:", key, item["payload"])
                break
            ttt = tt.groups()
            if ttt[1].isdigit():
                return {'size': int(ttt[1])}
            else:
                break
    
    print("size Error2:", key)
    return {'size': 0}

def process_key_addr(gdbmi, key):
    response = gdbmi.write('print /x &(' + key + ')', timeout_sec= 5)
    for item in response:
        if item["type"] == "console":
            tt = re.match(r'^\$(\d*) = 0x(.*)\n$', item["payload"])
            if tt is None:
                print("addr Error:", key, item["payload"])
                break
            ttt = tt.groups()
            return {'index': int(ttt[0]), 'addr': int(ttt[1], 16)}
    
    print("addr Error2:", key)
    return {'index': 0, 'addr': 0}
    
# @NewThread(200)
def process_ptype(gdbmi, key):
    response = gdbmi.write('ptype ' + key, timeout_sec= 5)
    member_list = []
    if len(response) > 3:
        for item in response:
            if item["type"] == "console" and "   " in item["payload"]:
                if ":" in item["payload"]:
                    tt = re.match(r'^(\ *)([^\ ]*) (.*) : (\d*);\n$', item["payload"])
                    if tt is None:
                        print("ptype Error:", key, item["payload"])
                        continue
                    ttt = tt.groups()
                    member_list.append({'type': ttt[1], 'name': ttt[2], 'addr_index': ttt[3]})
                else:
                    tt = re.match(r'^(\ *)([^\ ]*) (.*);\n$', item["payload"])
                    if tt is None:
                        print("ptype Error:", key, item["payload"])
                        continue
                    ttt = tt.groups()
                    member_list.append({'type': ttt[1], 'name': ttt[2]})
            #     print(tt)
            # print(item)
    else:
        for item in response:
            if item["type"] == "console":
                tt = re.match(r'^type = (.*)\n$', item["payload"])
                if tt is None:
                    print("ptype Error:", key, item["payload"])
                    continue
                ttt = tt.groups()
                member = {'name': '', 'type': ttt[0]}
                member_list.append(member)
        # print(response)
    
    for (index, member) in enumerate(member_list):
        if "*" in member["name"]:
            print('ptype del *:', member)
            del member_list[index]

    for member in member_list:
        member_key = key
        if len(member["name"]) > 0:
            member_key = member_key + '.' + member["name"]
        member['pkey'] = key
        member['member_key'] = member_key
        addr = process_key_addr(gdbmi, member_key)
        member['index'] = addr['index']
        member['addr'] = addr['addr']
        member['addr_hex'] = hex(addr['addr'])
        if member['addr'] == 0:
            member['size'] = 0
        else:
            size = process_key_size(gdbmi, member_key)
            member['size'] = size['size']
    
    # print("ptype", key, member_list)
    return member_list

def gdbmi_get(filename):
    gdbmi = GdbController()
    response = gdbmi.write('file ' + filename)
    print(response)
    print()
    return gdbmi

def process_file(filename):
    print(f'Processing file:', filename)
    
    variable_member = []

    pool = ThreadPool(40)

    def pool_run(attr):
        variable_item = attr[0]
        filename = attr[1]
        # print(variable_item)
        gdbmi = gdbmi_get(filename)
        return process_ptype(gdbmi, variable_item["name"])

    with open(filename, 'rb') as f:
        elffile = ELFFile(f)
        variable_list = process_symtab(elffile)

        variable_list2 = variable_list[0 : 1000]
        results = pool.map(pool_run, [(req, filename) for req in variable_list2])
        for result in results:
            variable_member += result
        # print('results', results)
        # requests = pool.makeRequests(pool_run, [(req) for req in variable_list])
        # [pool.putRequest(req) for req in requests]
        # pool.wait()
        # pool_num = len(variable_list)
        
        # for variable_item in variable_list:
            # if variable_item["name"] in ["speedAvgAbs", 'adc_buffer']:
            # print(variable_item)
            # variable_member += process_ptype(gdbmi, variable_item["name"])
            # pool.run(pool_run, (variable_item["name"],), callback=None)  # 将action函数，及action的参数，callback函数传给run()方法

            # print(variable_item["name"])
    # pool.close()
    print(variable_member)


        
struct_list = process_file('/Users/long/ss/hoverboard/hoverboard-firmware-hack-FOC/.pio/build/VARIANT_NIU/firmware.elf')  # Replace with your file
# print(struct_list)
