import protobuf from 'protobufjs';
import path from 'path';
import { glob } from 'glob';
import { readFileSync, outputJSONSync } from 'fs-extra';
import { existsSync } from 'fs';
import yaml from 'yaml';
import * as demux from './generated/proto/proto_demux/demux';

let protoFiles = glob.sync('proto/**/*.proto');
// Avoid loading local copies of google protobuf helpers — prefer protobufjs' bundled ones
protoFiles = protoFiles.filter((p) => !p.replace(/\\/g, '/').startsWith('proto/google/protobuf/'));
console.log(`Loaded ${protoFiles.length} protos`);

// Create a protobuf Root with a custom resolvePath so imports inside the
// .proto files (which reference logical folders like `proto_settings/...` or
// `google/...`) are resolved from the project's `proto` directory without
// modifying the proto files themselves.
const protoRootDir = path.resolve(process.cwd(), 'proto');
const root = new protobuf.Root();
root.resolvePath = (origin: string, target: string) => {
  // Normalize separators so we can make decisions platform-independently
  const normTarget = target.replace(/\\/g, '/').replace(/^\.\/+/, '');

  // absolute targets can be returned as-is
  if (path.isAbsolute(target)) return target;

  // Prefer local copy of google protos when present under proto/, otherwise
  // fall back to the protobufjs bundled definitions (by returning the
  // short 'google/...' name so protobufjs can match its internal common
  // map). This handles descriptor.proto which isn't bundled.
  if (normTarget.startsWith('google/')) {
    const candidate = path.join(protoRootDir, normTarget);
    if (existsSync(candidate)) return candidate;
    return normTarget; // let protobufjs use bundled version if available
  }

  // If the target is an initial globbed filename like 'proto/...' (we pass
  // glob results to loadSync), resolve relative to the project root.
  if (normTarget.startsWith('proto/')) {
    return path.resolve(process.cwd(), normTarget);
  }

  // Prefer resolving from the central 'proto' folder if that yields a file.
  const candidateFromProtoRoot = path.join(protoRootDir, normTarget);
  if (existsSync(candidateFromProtoRoot)) return candidateFromProtoRoot;

  // Otherwise try resolving relative to the importing file's folder.
  if (origin) {
    const rel = path.resolve(path.dirname(origin), normTarget);
    if (existsSync(rel)) return rel;
  }

  // Fallback to returning the candidate under proto root (even if missing)
  // — this mirrors protobufjs behavior and ensures predictable paths.
  return candidateFromProtoRoot;
};

const packageDefinition = root.loadSync(protoFiles);

const demuxSchema = packageDefinition.lookup('mg.protocol.demux') as protobuf.Namespace;

const serviceMapConfig: Record<string, string> = {
  utility_service: 'mg.protocol.utility',
  ownership_service: 'mg.protocol.ownership',
  denuvo_service: 'mg.protocol.denuvo_service',
  store_service: 'mg.protocol.store',
  friends_service: 'mg.protocol.friends',
  playtime_service: 'mg.playtime',
  party_service: 'mg.protocol.party',
  download_service: 'mg.protocol.download_service',
  client_configuration_service: 'mg.protocol.client_configuration',
  steam_service: 'mg.protocol.steam_service',
  wegame_service: 'mg.protocol.wegame_service',
  uplay_service: 'mg.protocol.uplay_service',
};

const serviceMap: Record<string, protobuf.Namespace> = {};
Object.entries(serviceMapConfig).forEach(([serviceName, packageName]) => {
  const ns = packageDefinition.lookup(packageName);
  if (ns) {
    serviceMap[serviceName] = ns as protobuf.Namespace;
  } else {
    console.warn(`Failed to load service package: ${serviceName} (${packageName})`);
  }
});

interface TLSPayload {
  length: number;
  data: Buffer;
  index: number;
  direction: 'Upstream' | 'Downstream';
}

export interface Packet {
  packet: number;
  peer: number;
  index: number;
  timestamp: number;
  data: string;
}

export interface Peer {
  peer: number;
  host: string;
  port: number;
}
export interface TLSStreamExport {
  peers: Peer[];
  packets: Packet[];
}

<<<<<<< HEAD
const decodeRequests = (payloads: TLSPayload[]): unknown[] => {
  const openServiceRequests = new Map<number, string>();
  const openConnectionRequests = new Map<number, string>();
  const openConnections = new Map<number, string>();
  const decodedDemux = payloads.map((payload) => {
    const schema = demuxSchema.lookupType(payload.direction);
    console.log(`${payload.direction} index ${payload.index}:`);
    if (payload.data.length !== payload.length) {
      console.warn(
        `Buffer length of ${payload.data.length} does not match expected length of ${payload.length}`
      );
      // Don't return null yet, try to decode anyway with actual buffer size
    }
    try {
      const body = schema.decode(payload.data) as
        | (protobuf.Message & demux.Upstream)
        | (protobuf.Message & demux.Downstream);

      // console.log(body);

      // Service requests/responses
      if ('request' in body && body.request?.serviceRequest) {
        const { requestId } = body.request;
        const { data, service } = body.request.serviceRequest;
        if (!service) {
          console.warn(`Missing service name in serviceRequest at index ${payload.index}`);
          return null;
        }
        const serviceSchema = serviceMap[service];
        if (!serviceSchema) {
          console.warn(`Missing service: ${service}`);
          return null;
        }
        const dataType = serviceSchema.lookupType(payload.direction);
        if (!dataType) {
          console.warn(`Missing type ${payload.direction} in service: ${service}`);
          return null;
        }
        const decodedData = dataType.decode(data) as never;
        openServiceRequests.set(requestId, service);
        const updatedBody = body.toJSON();
        updatedBody.request.serviceRequest.data = decodedData;
        return updatedBody;
      }
      if ('response' in body && body.response?.serviceRsp) {
        const { requestId } = body.response;
        const { data } = body.response.serviceRsp;
        const serviceName = openServiceRequests.get(requestId) as string;
        if (!serviceName) {
          console.warn(`No matching service request for response at index ${payload.index}`);
          return null;
        }
        const serviceSchema = serviceMap[serviceName];
        if (!serviceSchema) {
          console.warn(`Missing service: ${serviceName}`);
          return null;
        }
        const dataType = serviceSchema.lookupType(payload.direction);
        if (!dataType) {
          console.warn(`Missing type ${payload.direction} in service: ${serviceName}`);
          return null;
        }
        const decodedData = dataType.decode(data) as never;
        openServiceRequests.delete(requestId);
        const updatedBody = body.toJSON();
        updatedBody.response.serviceRsp.data = decodedData;
        return updatedBody;
      }

      // Connection requests/responses
      if ('request' in body && body.request?.openConnectionReq) {
        const { requestId } = body.request;
        const { serviceName } = body.request.openConnectionReq;
        console.log(`  OpenConnectionReq: requestId=${requestId}, serviceName=${serviceName}`);
        openConnectionRequests.set(requestId, serviceName);
      }
      if ('response' in body && body.response?.openConnectionRsp) {
        const { requestId } = body.response;
        const { connectionId, success } = body.response.openConnectionRsp;
        console.log(`  OpenConnectionRsp: requestId=${requestId}, connectionId=${connectionId}, success=${success}`);
        if (!success) {
          console.warn(`  Connection failed for requestId ${requestId}`);
          openConnectionRequests.delete(requestId);
          return body.toJSON();
        }
        const serviceName = openConnectionRequests.get(requestId) as string;
        if (!serviceName) {
          console.warn(`  No matching service for connectionId ${connectionId}`);
          return body.toJSON();
        }
        openConnections.set(connectionId, serviceName);
        openConnectionRequests.delete(requestId);
      }

      // Connection pushes/closed
      if ('push' in body && body.push?.data) {
        const { connectionId, data } = body.push.data;
        console.log(`  DataMessage: connectionId=${connectionId}`);
        const serviceName = openConnections.get(connectionId) as string;
        if (!serviceName) {
          console.warn(`No connection found for connection_id ${connectionId} at index ${payload.index}`);
          console.warn(`  Available connections: ${Array.from(openConnections.keys()).join(', ')}`);
          console.warn(`  Open requests: ${Array.from(openConnectionRequests.entries()).map(([id, svc]) => `${id}=>${svc}`).join(', ')}`);
          // Try to find if there's a pending request for this connection ID
          // Sometimes the response may come after the data
          return body.toJSON(); // Return as-is without trying to decode
        }
        const serviceSchema = serviceMap[serviceName];
        if (!serviceSchema) {
          console.warn(`Missing service: ${serviceName}`);
          return null;
        }
        const dataType = serviceSchema.lookupType(payload.direction);
        if (!dataType) {
          console.warn(`Missing type ${payload.direction} in service: ${serviceName}`);
          return null;
        }
        const trimmedPush = data.subarray(4); // First 4 bytes are length
        const decodedData = dataType.decode(trimmedPush) as never;
        const updatedBody = body.toJSON();
        updatedBody.push.data.data = decodedData;
        return updatedBody;
      }
      if ('push' in body && body.push?.connectionClosed) {
        const { connectionId } = body.push.connectionClosed;
        console.log(`  ConnectionClosed: connectionId=${connectionId}`);
        openConnections.delete(connectionId);
      }
      return body.toJSON();
    } catch (error) {
      console.warn(`Failed to decode ${payload.direction} at index ${payload.index}: ${error}`);
      return null;
=======
  const dataKeys = Object.keys(layers).filter((key) => key.match(/data\d*/));
  const payloads = dataKeys
    .map((key) => {
      const currentData = layers[key]?.['data.data'];
      if (!currentData) return null;
      return {
        frame,
        direction,
        data: Buffer.from(currentData.replace(/:/g, ''), 'hex'),
      };
    })
    .filter((p): p is TLSPayload => p !== null);
  return payloads;
};

const payloadJoiner = (payloads: TLSPayload[]): TLSPayload[] => {
  const joinedPayloads: TLSPayload[] = [];
  let currentPayload: Buffer | null = null;
  let currentPayloadLength: number | null = null;
  payloads.forEach((payload) => {
    const { data } = payload;
    if (currentPayload === null) {
      const length = data.readUInt32BE();
      const dataSeg = data.subarray(4);

      if (dataSeg.length === length) {
        joinedPayloads.push({ ...payload, data: dataSeg });
      } else {
        currentPayload = dataSeg;
        currentPayloadLength = length;
      }
    } else {
      const dataSeg = Buffer.concat([currentPayload, data]);
      if (dataSeg.length === currentPayloadLength) {
        joinedPayloads.push({ ...payload, data: dataSeg });
        currentPayload = null;
        currentPayloadLength = null;
      } else {
        currentPayload = dataSeg;
      }
    }
  });
  return joinedPayloads;
};

const decodeRequests = (payloads: TLSPayload[]): any[] => {
  const openServiceRequests = new Map<number, string>();
  const openConnectionRequests = new Map<number, string>();
  const openConnections = new Map<number, string>();
  const decodedDemux = payloads.map((payload) => {
    const schema = demuxSchema.lookupType(payload.direction);
    const body = schema.decode(payload.data) as
      | (protobuf.Message & demux.Upstream)
      | (protobuf.Message & demux.Downstream);

    // Service requests/responses
    if ('request' in body && body.request?.serviceRequest) {
      const { requestId } = body.request;
      const { data, service } = body.request.serviceRequest;
      const serviceSchema = serviceMap[service];
      if (!serviceSchema) throw new Error(`Missing service: ${service}`);
      const dataType = serviceSchema.lookupType(payload.direction);
      const decodedData = dataType.decode(data) as never;
      openServiceRequests.set(requestId, service);
      const updatedBody = body.toJSON();
      updatedBody.request.serviceRequest.data = decodedData;
      return updatedBody;
    }
    if ('response' in body && body.response?.serviceRsp) {
      const { requestId } = body.response;
      const { data } = body.response.serviceRsp;
      const serviceName = openServiceRequests.get(requestId) as string;
      const serviceSchema = serviceMap[serviceName];
      const dataType = serviceSchema.lookupType(payload.direction);
<<<<<<< HEAD
      const decodedData = dataType.decode(data);
      delete openRequests[requestId];
      body.response.serviceRsp.data = decodedData as never;
>>>>>>> 5365687 (Use generated demux types)
    }
=======
      const decodedData = dataType.decode(data) as never;
      openServiceRequests.delete(requestId);
      const updatedBody = body.toJSON();
      updatedBody.response.serviceRsp.data = decodedData;
      return updatedBody;
    }

    // Connection requests/responses
    if ('request' in body && body.request?.openConnectionReq) {
      const { requestId } = body.request;
      const { serviceName } = body.request.openConnectionReq;
      openConnectionRequests.set(requestId, serviceName);
    }
    if ('response' in body && body.response?.openConnectionRsp) {
      const { requestId } = body.response;
      const { connectionId } = body.response.openConnectionRsp;
      const serviceName = openConnectionRequests.get(requestId) as string;
      openConnections.set(connectionId, serviceName);
      openConnectionRequests.delete(requestId);
    }

    // Connection pushes/closed
    if ('push' in body && body.push?.data) {
      const { connectionId, data } = body.push.data;
      const serviceName = openConnections.get(connectionId) as string;
      const serviceSchema = serviceMap[serviceName];
      if (!serviceSchema) throw new Error(`Missing service: ${serviceName}`);
      const dataType = serviceSchema.lookupType(payload.direction);
      const trimmedPush = data.subarray(4); // First 4 bytes are length
      const decodedData = dataType.decode(trimmedPush) as never;
      const updatedBody = body.toJSON();
      updatedBody.push.data.data = decodedData;
      return updatedBody;
    }
    if ('push' in body && body.push?.connectionClosed) {
      const { connectionId } = body.push.connectionClosed;
      openConnections.delete(connectionId);
    }
    return body.toJSON();
>>>>>>> 7fd0c4a (Support decoding connection pushes)
  });
  return decodedDemux;
};

const main = () => {
  const tlsStream: TLSStreamExport = yaml.parse(readFileSync('tls-stream.yml', 'utf-8'), {
    resolveKnownTags: false, // wireshark of course spits out invalid yaml binary, so we don't resolve it here
    logLevel: 'error',
  });
  outputJSONSync('parsed-tls-stream.json', tlsStream, { spaces: 2 });
  const upstreamPeer = tlsStream.peers.find((peer) => peer.port > 0)?.peer || 0;
  const mappedPayloads: TLSPayload[] = tlsStream.packets.map((packet) => {
    const b64Segments = packet.data.split(/=+/); // If there's padding, we need to parse each b64 string individually
    const joinedBinary = b64Segments.reduce((acc, curr) => {
      const segmentBuf = Buffer.from(curr, 'base64');
      return Buffer.concat([acc, segmentBuf]);
    }, Buffer.alloc(0));
    
    // Try to detect if this is actually a valid length prefix
    const potentialLength = joinedBinary.readUInt32BE();
    const actualDataLength = joinedBinary.length - 4;
    
    // If the declared length is way larger than actual data (or suspiciously large), 
    // it might be corrupted or the length isn't actually a length field
    let length: number;
    let dataSeg: Buffer;
    
    if (potentialLength > joinedBinary.length || potentialLength > 1000000) {
      // Suspicious length, likely corrupted or not a length field
      console.log(`  Packet ${packet.index}: suspicious length=${potentialLength}, actual buffer size=${joinedBinary.length}, treating full buffer as data`);
      length = actualDataLength;
      dataSeg = joinedBinary.subarray(4); // Still try to skip first 4 bytes
    } else {
      length = potentialLength;
      dataSeg = joinedBinary.subarray(4);
    }
    
    return {
      length,
      data: dataSeg,
      index: packet.index,
      direction: packet.peer === upstreamPeer ? 'Upstream' : 'Downstream',
    };
  });
  const decodedDemuxes = decodeRequests(mappedPayloads);
  console.log(`Generated ${decodedDemuxes.length} responses`);
  outputJSONSync('decodes.json', decodedDemuxes, {
    spaces: 2,
  });
};

main();
