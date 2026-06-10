import fs from 'fs';

const file = 'server.js';
let code = fs.readFileSync(file, 'utf8');

const lines = code.split('\n');
let modifiedCount = 0;

for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*\}\s*catch\s*\((.*?)\)\s*\{/);
    if (match) {
        const errVar = match[1];

        let foundExistingLog = false;
        let logLineIndex = -1;

        for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
            if (lines[j].includes('console.error(') && !lines[j].includes('Context:')) {
                foundExistingLog = true;
                logLineIndex = j;
                break;
            }
            if (lines[j].includes('res.status') || lines[j].includes('res.json')) {
                break;
            }
        }

        const spaceMatch = lines[i].match(/^(\s*)/);
        const padding = spaceMatch ? spaceMatch[1] + '    ' : '        ';
        const newLog = `${padding}console.error('Context:', ${errVar}.message || ${errVar});`;

        if (foundExistingLog) {
            lines[logLineIndex] = newLog;
            modifiedCount++;
        } else {
            let hasContext = false;
            for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
                if (lines[j].includes('console.error(\\\'Context:\'')) {
                    hasContext = true;
                    break;
                }
            }
            if (!hasContext) {
                lines.splice(i + 1, 0, newLog);
                modifiedCount++;
            }
        }
    }
}

fs.writeFileSync('server.js', lines.join('\n'));
console.log('Modified catch blocks: ' + modifiedCount);
