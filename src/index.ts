#!/usr/bin/env node
const exec = require("child_process").exec;

interface Session {
    number: number;
    name: string;
}

interface Process {
    pid: number;
    name: string;
    session: Session;
    memory: number;
}

interface Group {
    id: number;
    data: string;
}

const getEmptySpacesUntilNextCharacter = (source: string, start: number) => {
    const chars = source.split("");
    const target = chars.slice(start);
    let spaces = 0;
    let currentIndex = 0;

    for (const char of target) {
        const isEmpty = char.trim().length === 0;
        if (!isEmpty) break;
        spaces++;
        currentIndex++;
    }

    return spaces;
};

const matchTextGroups = (source: string, pattern: string): Array<string> => {
    const chars = source.split("");
    const settings = pattern.split("x").filter((char) => char.length);
    const groups: Array<Group> = [];

    let prevGroupIndex = 0;
    let currentGroupIndex = 0;
    let currentSettingIndex = 0;

    chars.forEach((char, index) => {
        let isSpace = char.trim().length === 0;

        let currentSetting = settings[currentSettingIndex] ?? "+";
        let minSpaces = currentSetting.match(/_/g)?.length ?? 1;
        let shouldMatchMultipleSpaces = currentSetting.includes("+");

        if (isSpace) {
            const nextSpaces = getEmptySpacesUntilNextCharacter(source, index);
            const shouldSwitchGroup = shouldMatchMultipleSpaces
                ? nextSpaces > minSpaces
                : nextSpaces == minSpaces;

            if (shouldSwitchGroup) {
                currentGroupIndex++;
                return;
            }
        }

        const groupSwitched = prevGroupIndex !== currentGroupIndex;
        const canUpdateSetting = currentSettingIndex < settings.length - 1;

        if (groupSwitched) if (canUpdateSetting) currentSettingIndex++;

        const group = {
            id: currentGroupIndex,
            data: char,
        };

        groups.push(group);

        prevGroupIndex = Number(currentGroupIndex);
    });

    const filtered = groups
        .map(({ id }) => id)
        .filter((group, index, self) => self.indexOf(group) === index);
    return filtered.map((target) =>
        groups
            .filter(({ id }) => id === target)
            .map(({ data }) => data)
            .join("")
            .trim(),
    );
};

const getColumnsFromRow = (row: string) => {
    return matchTextGroups(row, "x_+x_x_+x_+x");
};

const columnsAsProcess = (columns) => {
    return {
        pid: Number(columns[1]),
        name: columns[0],
        session: {
            number: Number(columns[3]),
            name: columns[2],
        },
        memory: columns[4] as unknown as number,
    } as Process;
};

const rowAsColumns = (row: string) => getColumnsFromRow(row);

const getProcessListFromText = (text: string): Array<Process> => {
    const sanitized = text.substring(text.lastIndexOf("="), text.length - 1);
    const rows = sanitized.split("\n");
    return rows
        .map(rowAsColumns)
        .map(columnsAsProcess);
};

exec("tasklist", (err, stdout, stderr) => {
    if (err) console.log("There was an error getting task list.");

    const processes = getProcessListFromText(stdout);
    const MSBuildProcesses = processes.filter(({ name }) =>
        name.toLowerCase().includes("msbuild"),
    );

    if (!MSBuildProcesses.length)
        console.log("No MSBuild processes currently running.");

    MSBuildProcesses.forEach(({ pid, name }) => {
        exec(`taskkill /F /PID ${pid}`, (err, stdout, stderr) => {
            if (err) {
                console.log(`Failed to destroy MSBuild process: ${pid}`);
                return;
            }
            console.log(`Nuked ${name} with PID: ${pid}`);
        });
    });
});
