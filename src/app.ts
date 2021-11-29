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

interface ResponseAwaitingNextCommand {
  parsedIndex: number;
  response: express.Response;
  timestampOfArrival: number;
}

let responsesAwaitingLobbyCommand: ResponseAwaitingNextCommand[] = [];
let hostIdToResponsesAwaitingGameCommands: Map<
  string,
  ResponseAwaitingNextCommand[]
> = new Map();

const pauseBetweenGarbageCollectionsInMS = 1000;
const responseTimeToLiveInMS = 60000;

const jsonParser = bodyParser.json();

const hostIdToGameCommands: Map<string, ICommandObject[]> = new Map();
let lobbyCommands: ICommandObject[] = [];

app.delete("/", (req, res) => {
  hostIdToGameCommands.clear();
  lobbyCommands = [];
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
    notifyResponsesAwaitingGameCommandForHostId(hostId);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

function notifyResponsesAwaitingGameCommandForHostId(hostId: string): void {
  const responsesToProcess =
    hostIdToResponsesAwaitingGameCommands.get(hostId) || [];
  if (responsesToProcess.length) {
    hostIdToResponsesAwaitingGameCommands.delete(hostId);
    responsesToProcess.forEach(
      ({ response, parsedIndex }: ResponseAwaitingNextCommand) => {
        response.json(getGameCommandsAfterIndex(hostId, parsedIndex));
      }
    );
  }
}

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
      const newGameCommands = getGameCommandsAfterIndex(hostId, parsedIndex);
      if (newGameCommands.newCommands.length) {
        res.json(newGameCommands);
      } else {
        if (!hostIdToResponsesAwaitingGameCommands.has(hostId)) {
          hostIdToResponsesAwaitingGameCommands.set(hostId, []);
        }
        hostIdToResponsesAwaitingGameCommands.get(hostId).push({
          parsedIndex,
          response: res,
          timestampOfArrival: Date.now(),
        });
      }
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
    notifyResponsesAwaitingLobbyCommand();
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

function addCommandToLobby(command: ICommandObject): void {
  lobbyCommands.push(command);
}

function notifyResponsesAwaitingLobbyCommand(): void {
  const responsesToProcess = responsesAwaitingLobbyCommand.slice();
  responsesAwaitingLobbyCommand = [];
  responsesToProcess.forEach(
    ({ response, parsedIndex }: ResponseAwaitingNextCommand) => {
      response.json(getCommandsAfterIndex(lobbyCommands, parsedIndex));
    }
  );
}

function garbageCollectResponsesAwaitingLobbyCommands(): void {
  if (responsesAwaitingLobbyCommand.length) {
    const { responsesStillWaiting, responsesToProcess } =
      responsesAwaitingLobbyCommand.reduce(
        (prev, current) => {
          if (isTimeToDelete(current.timestampOfArrival)) {
            prev.responsesToProcess.push(current);
          } else {
            prev.responsesStillWaiting.push(current);
          }
          return prev;
        },
        { responsesStillWaiting: [], responsesToProcess: [] }
      );

    responsesAwaitingLobbyCommand = responsesStillWaiting;
    responsesToProcess.forEach(
      ({ response, parsedIndex }: ResponseAwaitingNextCommand) => {
        response.json(getCommandsAfterIndex(lobbyCommands, parsedIndex));
      }
    );
  }

  setTimeout(
    garbageCollectResponsesAwaitingLobbyCommands,
    pauseBetweenGarbageCollectionsInMS
  );
}

function garbageCollectResponsesAwaitingGameCommands(): void {
  if (hostIdToResponsesAwaitingGameCommands.size) {
    const shallowClone = new Map(hostIdToResponsesAwaitingGameCommands);
    hostIdToResponsesAwaitingGameCommands.clear();

    shallowClone.forEach(
      (responsesWaiting: ResponseAwaitingNextCommand[], hostId: string) => {
        if (responsesWaiting.length) {
          responsesWaiting.forEach((responseWaiting) => {
            respondToOrContinueHoldingWaitingResponse(responseWaiting, hostId);
          });
        }
      }
    );
  }
  setTimeout(
    garbageCollectResponsesAwaitingGameCommands,
    pauseBetweenGarbageCollectionsInMS
  );
}

function respondToOrContinueHoldingWaitingResponse(
  responseWaiting: ResponseAwaitingNextCommand,
  hostId: string
): void {
  const { parsedIndex, response, timestampOfArrival } = responseWaiting;
  if (isTimeToDelete(timestampOfArrival)) {
    response.json(getGameCommandsAfterIndex(hostId, parsedIndex));
  } else {
    if (!hostIdToResponsesAwaitingGameCommands.has(hostId)) {
      hostIdToResponsesAwaitingGameCommands.set(hostId, []);
    }
    hostIdToResponsesAwaitingGameCommands.get(hostId).push(responseWaiting);
  }
}

function isTimeToDelete(timestampOfArrival: number): boolean {
  return Date.now() - timestampOfArrival > responseTimeToLiveInMS;
}

app.get("/lobby/:indexOfNextCommand", (req, res) => {
  const { indexOfNextCommand } = req.params;
  try {
    const parsedIndex = parseInt(indexOfNextCommand, 10);
    if (parsedIndex >= 0) {
      const commands = getCommandsAfterIndex(lobbyCommands, parsedIndex);
      if (commands.newCommands.length) {
        res.json(commands);
      } else {
        responsesAwaitingLobbyCommand.push({
          parsedIndex,
          response: res,
          timestampOfArrival: Date.now(),
        });
      }
    } else {
      res.sendStatus(400);
    }
  } catch (err) {
    res.sendStatus(400);
  }
});

garbageCollectResponsesAwaitingLobbyCommands();
garbageCollectResponsesAwaitingGameCommands();

app.listen(port, () => {
  return console.log(`Server is listening on port: ${port}`);
});
