/**
 * JSON형태의 데이터를 테이블로 만든다
 * @author azki (azki@azki.org)
 * @version 1.01
 * @param {Element} parent
 * @param {Object} data
 * @return {void}
 */
function jsonDisplay(parent, data){
	
	/**
	 * table 을 만들어 반환함.
	 * @param {Element} parent
	 * @return {Element}
	 */
    function createTable(parent){
        var table = document.createElement("table");
        table.border = "1";
        return parent.appendChild(table);
    }
    
	/**
	 * array 타입의 데이타를 가지고 row를 생성.
	 * @param {Element} table
	 * @param {Array} array
	 * @return {void}
	 */
    function tableByArray(table, array){
        if (table._rowCount == null) {
            table._rowCount = 0;
        }
        for (var i = 0, len = array.length; i < len; i++) {
            var row = table.insertRow(table._rowCount++);
            tableByObject(row, array[i]);
        }
    }
    
	/**
	 * object 타입의 데이타를 가지고 table이나 cell을 생성.
	 * object 의 멤버중 object는 새로운 table을 만들고,
	 * object 가 아닌 멤버들은 cell로 만든다.
	 * @param {Element} tr
	 * @param {Object} obj
	 * @return {void}
	 */
    function tableByObject(tr, obj){
        if (tr._cellCount == null) {
            tr._cellCount = 0;
        }
        for (var name in obj) {
            var item = obj[name];
            var cell = tr.insertCell(tr._cellCount++);
            cell.style.verticalAlign = "top";
            tableHeaderCreate(cell.offsetParent, name);
            if (typeof item == "object") {
                if (item.constructor == Array) {
                    tableByArray(createTable(cell), item);
                }
                else {
                    tableByObject(createTable(cell).insertRow(0), item);
                }
            }
            else {
                cell.innerHTML += item;
            }
        }
    }
    
	/**
	 * 테이블의 헤더를 만든다. (thead와 비슷.)
	 * @param {Element} table
	 * @param {string} name
	 * @return {void}
	 */
    function tableHeaderCreate(table, name){
        if (table._rowCount == null) {
            table._rowCount = 0;
        }
        if (table._headerNames == null) {
            table._headerNames = [];
        }
        var i = 0, hasName;
        while (hasName = table._headerNames[i++]) {
            if (hasName == name) {
                return;
            }
        }
        table._headerNames.push(name);
        if (table._headerTr == null) {
            table._headerTr = table.insertRow(0);
            table._rowCount++;
        }
        if (table._headerTr._cellCount == null) {
            table._headerTr._cellCount = 0;
        }
        var cell = table._headerTr.insertCell(table._headerTr._cellCount++);
        cell.innerHTML = name;
    }
    
    tableByObject(createTable(parent).insertRow(0), data);
}