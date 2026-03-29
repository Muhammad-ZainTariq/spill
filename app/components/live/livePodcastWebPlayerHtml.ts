export function getLivePodcastWebPlayerHtml() {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
        overflow: hidden;
      }
      #audio-root {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0.01;
        pointer-events: none;
      }
      audio {
        width: 1px;
        height: 1px;
        opacity: 0.01;
      }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
  </head>
  <body>
    <div id="audio-root"></div>
    <script>
      (function () {
        var room = null;
        var audioRoot = document.getElementById('audio-root');
        var attachedAudio = {};
        var micEnabled = false;

        function send(type, payload) {
          if (!window.ReactNativeWebView) return;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} }));
        }

        function safeName(participant) {
          return participant && (participant.name || participant.identity || 'Listener');
        }

        function syncParticipants() {
          if (!room) {
            send('participants', { participants: [] });
            return;
          }
          var activeSpeakers = new Set((room.activeSpeakers || []).map(function (p) { return p.identity; }));
          var participants = [];
          if (room.localParticipant) {
            participants.push({
              identity: room.localParticipant.identity,
              name: safeName(room.localParticipant),
              isLocal: true,
              isSpeaking: activeSpeakers.has(room.localParticipant.identity),
            });
          }
          room.remoteParticipants.forEach(function (participant) {
            participants.push({
              identity: participant.identity,
              name: safeName(participant),
              isLocal: false,
              isSpeaking: activeSpeakers.has(participant.identity),
            });
          });
          send('participants', { participants: participants });
        }

        function attachTrack(track, participantSid) {
          if (!track || track.kind !== 'audio') return;
          var key = String(track.sid || participantSid || Math.random());
          if (attachedAudio[key]) return;
          try {
            var element = track.attach();
            element.autoplay = true;
            element.playsInline = true;
            element.controls = false;
            attachedAudio[key] = element;
            audioRoot.appendChild(element);
          } catch (error) {
            send('error', { message: error && error.message ? error.message : 'Failed to attach audio track.' });
          }
        }

        function detachTrack(track, participantSid) {
          var key = String((track && track.sid) || participantSid || '');
          var element = attachedAudio[key];
          if (!element) return;
          try {
            if (track && track.detach) track.detach(element);
            if (element.parentNode) element.parentNode.removeChild(element);
          } catch (error) {}
          delete attachedAudio[key];
        }

        async function cleanup() {
          Object.keys(attachedAudio).forEach(function (key) {
            detachTrack({ sid: key, detach: function () {} }, key);
          });
          attachedAudio = {};
          if (room) {
            try {
              await room.disconnect();
            } catch (error) {}
            room = null;
          }
          micEnabled = false;
          send('state', { status: 'idle', micEnabled: false });
          syncParticipants();
        }

        async function connect(payload) {
          var LK = window.LivekitClient;
          if (!LK) {
            send('error', { message: 'LiveKit client failed to load.' });
            return;
          }
          send('state', { status: 'connecting', micEnabled: false });
          await cleanup();
          room = new LK.Room({
            adaptiveStream: true,
            dynacast: true,
          });

          room
            .on(LK.RoomEvent.TrackSubscribed, function (track, publication, participant) {
              attachTrack(track, participant && participant.sid);
              syncParticipants();
            })
            .on(LK.RoomEvent.TrackUnsubscribed, function (track, publication, participant) {
              detachTrack(track, participant && participant.sid);
              syncParticipants();
            })
            .on(LK.RoomEvent.ParticipantConnected, syncParticipants)
            .on(LK.RoomEvent.ParticipantDisconnected, syncParticipants)
            .on(LK.RoomEvent.ActiveSpeakersChanged, syncParticipants)
            .on(LK.RoomEvent.ConnectionStateChanged, function (state) {
              send('state', { status: String(state || '').toLowerCase(), micEnabled: micEnabled });
            })
            .on(LK.RoomEvent.Disconnected, function () {
              send('state', { status: 'disconnected', micEnabled: false });
              syncParticipants();
            });

          try {
            await room.connect(payload.serverUrl, payload.token);
            try {
              await room.startAudio();
            } catch (error) {}
            if (payload.canPublish) {
              await room.localParticipant.setMicrophoneEnabled(true);
              micEnabled = true;
            } else {
              micEnabled = false;
            }
            room.remoteParticipants.forEach(function (participant) {
              participant.audioTrackPublications.forEach(function (publication) {
                if (publication.track) attachTrack(publication.track, participant.sid);
              });
            });
            send('state', { status: 'connected', micEnabled: micEnabled });
            syncParticipants();
          } catch (error) {
            send('error', { message: error && error.message ? error.message : 'Failed to connect to room.' });
            send('state', { status: 'error', micEnabled: false });
          }
        }

        async function toggleMic() {
          if (!room || !room.localParticipant) return;
          try {
            micEnabled = !micEnabled;
            await room.localParticipant.setMicrophoneEnabled(micEnabled);
            send('state', { status: 'connected', micEnabled: micEnabled });
          } catch (error) {
            micEnabled = !micEnabled;
            send('error', { message: error && error.message ? error.message : 'Failed to change mic state.' });
          }
        }

        window.__SPILL_LIVEKIT_COMMAND = async function (command) {
          if (!command || !command.type) return;
          if (command.type === 'connect') return connect(command.payload || {});
          if (command.type === 'disconnect') return cleanup();
          if (command.type === 'toggleMic') return toggleMic();
          if (command.type === 'ping') return send('ready', { ok: true });
        };

        send('ready', { ok: true });
      })();
    </script>
  </body>
</html>`;
}
