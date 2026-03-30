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
        var playbackMuted = false;
        var transcriptWs = null;
        var transcriptAudioContext = null;
        var transcriptSource = null;
        var transcriptProcessor = null;
        var transcriptGain = null;
        var transcriptStream = null;
        var transcriptSequence = 0;
        var currentTranscriptDraftId = null;

        function send(type, payload) {
          if (!window.ReactNativeWebView) return;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} }));
        }

        function safeName(participant) {
          return participant && (participant.name || participant.identity || 'Listener');
        }

        function stopTranscript() {
          currentTranscriptDraftId = null;
          transcriptSequence = 0;
          if (transcriptProcessor) {
            try { transcriptProcessor.disconnect(); } catch (error) {}
            transcriptProcessor.onaudioprocess = null;
            transcriptProcessor = null;
          }
          if (transcriptSource) {
            try { transcriptSource.disconnect(); } catch (error) {}
            transcriptSource = null;
          }
          if (transcriptGain) {
            try { transcriptGain.disconnect(); } catch (error) {}
            transcriptGain = null;
          }
          if (transcriptAudioContext) {
            try { transcriptAudioContext.close(); } catch (error) {}
            transcriptAudioContext = null;
          }
          if (transcriptStream) {
            try {
              transcriptStream.getTracks().forEach(function (track) { track.stop(); });
            } catch (error) {}
            transcriptStream = null;
          }
          if (transcriptWs) {
            try {
              if (transcriptWs.readyState === WebSocket.OPEN) {
                transcriptWs.send(JSON.stringify({ type: 'Terminate' }));
              }
              transcriptWs.close();
            } catch (error) {}
            transcriptWs = null;
          }
        }

        function downsampleBuffer(buffer, inputRate, outputRate) {
          if (!buffer || !buffer.length) return null;
          if (outputRate >= inputRate) return buffer;
          var sampleRateRatio = inputRate / outputRate;
          var newLength = Math.round(buffer.length / sampleRateRatio);
          var result = new Float32Array(newLength);
          var offsetResult = 0;
          var offsetBuffer = 0;
          while (offsetResult < result.length) {
            var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            var accum = 0;
            var count = 0;
            for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
              accum += buffer[i];
              count++;
            }
            result[offsetResult] = count ? accum / count : 0;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
          }
          return result;
        }

        function floatTo16BitPCM(floatBuffer) {
          var buffer = new ArrayBuffer(floatBuffer.length * 2);
          var view = new DataView(buffer);
          for (var i = 0; i < floatBuffer.length; i++) {
            var sample = Math.max(-1, Math.min(1, floatBuffer[i]));
            view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          }
          return buffer;
        }

        function handleTranscriptTurn(data) {
          var transcript = String(data && data.transcript ? data.transcript : '').trim();
          if (!transcript) return;
          var isFinal = !!(data && (data.turn_is_formatted || data.end_of_turn));
          var workingSequence = transcriptSequence + 1;
          if (!currentTranscriptDraftId) {
            currentTranscriptDraftId = 'turn-' + String(workingSequence);
          }
          var turnId = currentTranscriptDraftId;
          if (isFinal) {
            transcriptSequence = workingSequence;
            currentTranscriptDraftId = null;
          }
          send('transcriptTurn', {
            id: turnId,
            text: transcript,
            isFinal: isFinal,
            sequence: workingSequence,
            createdAt: new Date().toISOString(),
          });
        }

        async function startTranscript(config) {
          if (!config || !config.token || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return;
          }
          stopTranscript();
          var params = [
            'sample_rate=' + encodeURIComponent(String(config.sampleRate || 16000)),
            'formatted_finals=' + encodeURIComponent(config.formattedFinals ? 'true' : 'false'),
            'speech_model=' + encodeURIComponent(String(config.speechModel || 'u3-rt-pro')),
            'token=' + encodeURIComponent(String(config.token)),
          ].join('&');
          transcriptWs = new WebSocket('wss://streaming.assemblyai.com/v3/ws?' + params);
          transcriptWs.binaryType = 'arraybuffer';

          transcriptWs.onopen = async function () {
            try {
              transcriptStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  channelCount: 1,
                  noiseSuppression: true,
                  echoCancellation: true,
                },
              });
              var AudioCtx = window.AudioContext || window.webkitAudioContext;
              if (!AudioCtx) {
                throw new Error('AudioContext is not available for live captions.');
              }
              transcriptAudioContext = new AudioCtx();
              transcriptSource = transcriptAudioContext.createMediaStreamSource(transcriptStream);
              transcriptProcessor = transcriptAudioContext.createScriptProcessor(4096, 1, 1);
              transcriptGain = transcriptAudioContext.createGain();
              transcriptGain.gain.value = 0;
              transcriptProcessor.onaudioprocess = function (event) {
                if (!transcriptWs || transcriptWs.readyState !== WebSocket.OPEN) return;
                var inputData = event.inputBuffer.getChannelData(0);
                var downsampled = downsampleBuffer(inputData, transcriptAudioContext.sampleRate, Number(config.sampleRate || 16000));
                if (!downsampled || !downsampled.length) return;
                transcriptWs.send(floatTo16BitPCM(downsampled));
              };
              transcriptSource.connect(transcriptProcessor);
              transcriptProcessor.connect(transcriptGain);
              transcriptGain.connect(transcriptAudioContext.destination);
            } catch (error) {
              send('error', {
                message:
                  error && error.message
                    ? error.message
                    : 'Could not access the microphone for live captions.',
              });
              stopTranscript();
            }
          };

          transcriptWs.onmessage = function (event) {
            try {
              var data = JSON.parse(event.data);
              if (data && data.type === 'Turn') {
                handleTranscriptTurn(data);
              }
            } catch (error) {
              send('error', {
                message:
                  error && error.message
                    ? error.message
                    : 'Failed to parse live caption data.',
              });
            }
          };

          transcriptWs.onerror = function () {
            send('error', { message: 'Live captions encountered a connection error.' });
          };

          transcriptWs.onclose = function () {
            transcriptWs = null;
          };
        }

        function syncParticipants() {
          if (!room) {
            send('participants', { participants: [] });
            return;
          }
          var speakerLevels = {};
          (room.activeSpeakers || []).forEach(function (speaker) {
            speakerLevels[speaker.identity] = Number(speaker.audioLevel || 0);
          });
          var participants = [];
          if (room.localParticipant) {
            participants.push({
              identity: room.localParticipant.identity,
              name: safeName(room.localParticipant),
              isLocal: true,
              isSpeaking: !!speakerLevels[room.localParticipant.identity],
              audioLevel: Number(speakerLevels[room.localParticipant.identity] || 0),
            });
          }
          room.remoteParticipants.forEach(function (participant) {
            participants.push({
              identity: participant.identity,
              name: safeName(participant),
              isLocal: false,
              isSpeaking: !!speakerLevels[participant.identity],
              audioLevel: Number(speakerLevels[participant.identity] || 0),
            });
          });
          send('participants', { participants: participants });
        }

        function applyPlaybackMuted() {
          Object.keys(attachedAudio).forEach(function (key) {
            var entry = attachedAudio[key];
            if (!entry || !entry.element) return;
            entry.element.muted = playbackMuted;
            entry.element.volume = playbackMuted ? 0 : 1;
            if (entry.track && typeof entry.track.setVolume === 'function') {
              entry.track.setVolume(playbackMuted ? 0 : 1);
            }
          });
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
            element.muted = playbackMuted;
            element.volume = playbackMuted ? 0 : 1;
            if (typeof track.setVolume === 'function') {
              track.setVolume(playbackMuted ? 0 : 1);
            }
            attachedAudio[key] = { element: element, track: track };
            audioRoot.appendChild(element);
          } catch (error) {
            send('error', { message: error && error.message ? error.message : 'Failed to attach audio track.' });
          }
        }

        function detachTrack(track, participantSid) {
          var key = String((track && track.sid) || participantSid || '');
          var entry = attachedAudio[key];
          if (!entry || !entry.element) return;
          try {
            if (track && track.detach) track.detach(entry.element);
            if (entry.element.parentNode) entry.element.parentNode.removeChild(entry.element);
          } catch (error) {}
          delete attachedAudio[key];
        }

        async function cleanup() {
          stopTranscript();
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
          playbackMuted = false;
          send('state', { status: 'idle', micEnabled: false, playbackMuted: false });
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
              send('state', { status: String(state || '').toLowerCase(), micEnabled: micEnabled, playbackMuted: playbackMuted });
            })
            .on(LK.RoomEvent.Disconnected, function () {
              send('state', { status: 'disconnected', micEnabled: false, playbackMuted: playbackMuted });
              syncParticipants();
            });

          try {
            await room.connect(payload.serverUrl, payload.token);
            try {
              await room.startAudio();
            } catch (error) {}
            if (payload.canPublish) {
              try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                  var probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  probeStream.getTracks().forEach(function (track) { track.stop(); });
                }
              } catch (permissionError) {
                send('error', {
                  message:
                    (permissionError && permissionError.message)
                      ? permissionError.message
                      : 'Microphone permission was denied for the live room.',
                });
              }
              await room.localParticipant.setMicrophoneEnabled(true);
              micEnabled = true;
              if (payload.transcript && payload.transcript.token) {
                startTranscript(payload.transcript);
              }
            } else {
              micEnabled = false;
            }
            room.remoteParticipants.forEach(function (participant) {
              participant.audioTrackPublications.forEach(function (publication) {
                if (publication.track) attachTrack(publication.track, participant.sid);
              });
            });
            send('state', { status: 'connected', micEnabled: micEnabled, playbackMuted: playbackMuted });
            syncParticipants();
          } catch (error) {
            send('error', { message: error && error.message ? error.message : 'Failed to connect to room.' });
            send('state', { status: 'error', micEnabled: false, playbackMuted: playbackMuted });
          }
        }

        async function toggleMic() {
          if (!room || !room.localParticipant) return;
          try {
            micEnabled = !micEnabled;
            await room.localParticipant.setMicrophoneEnabled(micEnabled);
            send('state', { status: 'connected', micEnabled: micEnabled, playbackMuted: playbackMuted });
          } catch (error) {
            micEnabled = !micEnabled;
            send('error', { message: error && error.message ? error.message : 'Failed to change mic state.' });
          }
        }

        function togglePlayback() {
          playbackMuted = !playbackMuted;
          applyPlaybackMuted();
          send('state', { status: room ? 'connected' : 'idle', micEnabled: micEnabled, playbackMuted: playbackMuted });
        }

        window.__SPILL_LIVEKIT_COMMAND = async function (command) {
          if (!command || !command.type) return;
          if (command.type === 'connect') return connect(command.payload || {});
          if (command.type === 'disconnect') return cleanup();
          if (command.type === 'toggleMic') return toggleMic();
          if (command.type === 'togglePlayback') return togglePlayback();
          if (command.type === 'ping') return send('ready', { ok: true });
        };

        send('ready', { ok: true });
      })();
    </script>
  </body>
</html>`;
}
