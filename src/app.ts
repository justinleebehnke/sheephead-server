import bodyParser from "body-parser";
import cors from "cors";
import express from "express";

const app = express();
app.use(cors());
const port = process.env.PORT || 8080;

interface ICommandObject {}

interface ICommandCommunicatorResponse {
  indexOfNextCommand: number;
  newCommands: ICommandObject[];
}

const jsonParser = bodyParser.json();

const hostIdToGameCommands: Map<string, ICommandObject[]> = new Map();
const lobbyCommands: ICommandObject[] = [];

app.delete("/", (req, res) => {
  hostIdToGameCommands.clear();
  while (lobbyCommands.length > 0) {
    lobbyCommands.pop();
  }
  res.send(200);
});

app.delete("/game/:hostId", (req, res) => {
  const { hostId } = req.params;
  hostIdToGameCommands.delete(hostId);
  res.sendStatus(200);
});

app.post("/game/:hostId", jsonParser, (req, res) => {
  if (isICommandCommunicatorRequest(req.body)) {
    const { hostId } = req.params;
    const newCommand: ICommandObject = req.body;
    addCommandToGame(hostId, newCommand);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

function isICommandCommunicatorRequest(
  request: any
): request is ICommandObject {
  return request && request.name;
}

function addCommandToGame(hostId: string, command: ICommandObject): void {
  const commands: ICommandObject[] = hostIdToGameCommands.get(hostId) || [];
  commands.push(command);
  hostIdToGameCommands.set(hostId, commands);
}

function getGameCommandsAfterIndex(
  hostId: string,
  indexOfNextCommand: number
): ICommandCommunicatorResponse {
  const gameCommands = hostIdToGameCommands.get(hostId) || [];
  return getCommandsAfterIndex(gameCommands, indexOfNextCommand);
}

app.get("/game/:hostId/:indexOfNextCommand", (req, res) => {
  const { hostId, indexOfNextCommand } = req.params;
  try {
    const parsedIndex = parseInt(indexOfNextCommand, 10);
    if (parsedIndex >= 0) {
      res.json(getGameCommandsAfterIndex(hostId, parsedIndex));
    } else {
      res.sendStatus(400);
    }
  } catch (err) {
    res.sendStatus(400);
  }
});

function getCommandsAfterIndex(
  commands: ICommandObject[],
  indexOfNextCommand: number
): ICommandCommunicatorResponse {
  return {
    indexOfNextCommand: commands.length,
    newCommands: commands.slice(indexOfNextCommand),
  };
}

app.post("/lobby", jsonParser, (req, res) => {
  if (isICommandCommunicatorRequest(req.body)) {
    const newCommand = req.body;
    addCommandToLobby(newCommand);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

function addCommandToLobby(command: ICommandObject): void {
  lobbyCommands.push(command);
}

app.get("/lobby/:indexOfNextCommand", (req, res) => {
  const { indexOfNextCommand } = req.params;
  try {
    const parsedIndex = parseInt(indexOfNextCommand, 10);
    if (parsedIndex >= 0) {
      res.json(getCommandsAfterIndex(lobbyCommands, parsedIndex));
    } else {
      res.sendStatus(400);
    }
  } catch (err) {
    res.sendStatus(400);
  }
});

app.listen(port, () => {
  return console.log(`Server is listening on port: ${port}`);
});
