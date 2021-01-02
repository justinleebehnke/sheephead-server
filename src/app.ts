import bodyParser from "body-parser";
import cors from "cors";
import express from "express";

const app = express();
app.use(cors());
const port = 2020;

interface ICommandObject {}

interface ICommandCommunicatorRequest {
  indexOfNextCommand: number;
  newCommand: ICommandObject;
}

interface ICommandCommunicatorResponse {
  indexOfNextCommand: number;
  newCommands: ICommandObject[];
}

const jsonParser = bodyParser.json();

const hostIdToGameCommands: Map<string, ICommandObject[]> = new Map();
const lobbyCommands: ICommandObject[] = [];

app.delete("/game/:hostId", (req, res) => {
  const { hostId } = req.params;
  hostIdToGameCommands.delete(hostId);
  res.sendStatus(200);
});

app.post("/game/:hostId", jsonParser, (req, res) => {
  if (isICommandCommunicatorRequest(req.body)) {
    const { hostId } = req.params;
    const {
      newCommand,
      indexOfNextCommand,
    }: ICommandCommunicatorRequest = req.body;
    addCommandToGame(hostId, newCommand);
    res.json(getGameCommandsAfterIndex(hostId, indexOfNextCommand));
  } else {
    res.sendStatus(400);
  }
});

function isICommandCommunicatorRequest(
  request: any
): request is ICommandCommunicatorRequest {
  return request && request.indexOfNextCommand >= 0 && request.newCommand;
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
    const { indexOfNextCommand } = req.body;
    addCommandToLobby(req.body.newCommand);
    res.json(getCommandsAfterIndex(lobbyCommands, indexOfNextCommand));
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
