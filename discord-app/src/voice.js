window.VoxiumVoice = (() => {
    function createVoiceState() {
        return {
            joinedRoomId: null,
            localStream: null,
            screenStream: null,
            screenTrack: null,
            screenSharing: false,
            screenQuality: localStorage.getItem("voiceScreenQuality") || "1080",
            screenFps: localStorage.getItem("voiceScreenFps") || "30",
            peers: {},
            screenSenders: {},
            audioEls: {},
            remoteStreams: {},
            remoteScreenEls: {},
            members: {},
            muted: false,
            deafened: false,
        };
    }

    function createVoiceController(deps) {
        const dom = deps.dom;

        let micMeterAudioCtx = null;
        let micMeterAnalyser = null;
        let micMeterSource = null;
        let micMeterData = null;
        let micMeterAnim = null;

        const getState = deps.getState;
        const videoController = window.VoxiumVideo.createVideoShareController({
            getState,
            dom,
            ensureVoiceMember: (userId, username) => ensureVoiceMember(userId, username),
            renderVoiceMembers: () => renderVoiceMembers(),
            updateVoiceButtons: () => updateVoiceButtons(),
            renegotiatePeer: (remoteUserId) => renegotiatePeer(remoteUserId),
            broadcastVoiceState: () => broadcastVoiceState(),
        });

        function getScreenQualityPreset(value) {
            return videoController.getScreenQualityPreset(value);
        }

        function getScreenCaptureConstraints() {
            return videoController.getScreenCaptureConstraints();
        }

        function getScreenTrackConstraints() {
            return videoController.getScreenTrackConstraints();
        }

        async function applyScreenTrackConstraints(track) {
            return videoController.applyScreenTrackConstraints(track);
        }

        function syncScreenShareSettingsUI() {
            return videoController.syncScreenShareSettingsUI();
        }

        function updateScreenShareSettingsFromUI() {
            return videoController.updateScreenShareSettingsFromUI();
        }

        function handleScreenSettingsChange() {
            return videoController.handleScreenSettingsChange();
        }

        function getScreenProfileLabel(quality, fps) {
            return videoController.getScreenProfileLabel(quality, fps);
        }

        function updateVoiceButtons() {
            const state = getState();
            const inVoice = !!state.voice.joinedRoomId;
            dom.joinVoiceBtn.classList.toggle("hidden", inVoice || state.currentRoomKind !== "voice");
            dom.leaveVoiceBtn.classList.toggle("hidden", !inVoice);
            dom.voiceMuteBtn.classList.toggle("hidden", !inVoice);
            dom.voiceDeafenBtn.classList.toggle("hidden", !inVoice);
            dom.voiceScreenBtn.classList.toggle("hidden", !inVoice);

            const muteLabel = state.voice.muted ? "Réactiver micro" : "Muet";
            const deafenLabel = state.voice.deafened ? "Réactiver casque" : "Sourdine";
            const screenLabel = state.voice.screenSharing ? "Arrêter partage" : "Partager écran";
            dom.voiceMuteBtn.title = muteLabel;
            dom.voiceMuteBtn.setAttribute("aria-label", muteLabel);
            dom.voiceDeafenBtn.title = deafenLabel;
            dom.voiceDeafenBtn.setAttribute("aria-label", deafenLabel);
            dom.voiceScreenBtn.title = screenLabel;
            dom.voiceScreenBtn.setAttribute("aria-label", screenLabel);

            dom.voiceMuteBtn.classList.toggle("is-danger", state.voice.muted);
            dom.voiceDeafenBtn.classList.toggle("is-danger", state.voice.deafened);
            dom.voiceScreenBtn.classList.toggle("is-good", state.voice.screenSharing);

            dom.muteBtn.title = muteLabel;
            dom.deafenBtn.title = deafenLabel;
        }

        function renderMicMeter(level) {
            const state = getState();
            const bars = dom.voiceMeterBars ? dom.voiceMeterBars.querySelectorAll("span") : [];
            const clamped = Math.max(0, Math.min(1, level));
            const activeBars = Math.round(clamped * bars.length);
            bars.forEach((bar, idx) => {
                bar.classList.toggle("active", idx < activeBars);
            });

            if (!dom.voiceMeterLabel) return;
            if (!state.voice.joinedRoomId) {
                dom.voiceMeterLabel.textContent = "Micro inactif";
            } else if (state.voice.muted || state.voice.deafened) {
                dom.voiceMeterLabel.textContent = "Micro coupé";
            } else if (activeBars === 0) {
                dom.voiceMeterLabel.textContent = "Parle pour tester";
            } else {
                dom.voiceMeterLabel.textContent = `Niveau micro ${Math.round(clamped * 100)}%`;
            }
        }

        function updateVoiceQuickStatus() {
            const state = getState();
            if (!dom.voiceQuickStatus || !dom.voiceStatusText) return;

            dom.voiceQuickStatus.classList.remove("is-selected", "is-connected");
            if (dom.voiceRoomChip) {
                dom.voiceRoomChip.classList.remove("is-live", "is-selected");
            }

            if (state.voice.joinedRoomId) {
                const room = state.rooms.find((r) => r.id === state.voice.joinedRoomId);
                dom.voiceQuickStatus.classList.add("is-connected");
                dom.voiceStatusText.textContent = `Connecté : ${room ? room.name : "salon vocal"}`;
                if (dom.voiceRoomChip) {
                    dom.voiceRoomChip.textContent = "Connecté";
                    dom.voiceRoomChip.classList.add("is-live");
                }
                if (dom.voiceRoomSubtitle) {
                    dom.voiceRoomSubtitle.textContent = `Discussion active dans ${room ? room.name : "ce salon"}.`;
                }
            } else if (state.currentRoomKind === "voice" && state.currentRoomName) {
                dom.voiceQuickStatus.classList.add("is-selected");
                dom.voiceStatusText.textContent = `Sélectionné : ${state.currentRoomName}`;
                if (dom.voiceRoomChip) {
                    dom.voiceRoomChip.textContent = "Sélectionné";
                    dom.voiceRoomChip.classList.add("is-selected");
                }
                if (dom.voiceRoomSubtitle) {
                    dom.voiceRoomSubtitle.textContent = "Rejoignez ce salon pour discuter en audio.";
                }
            } else {
                dom.voiceStatusText.textContent = "Pas connecté à un salon vocal";
                if (dom.voiceRoomChip) {
                    dom.voiceRoomChip.textContent = "Non connecté";
                }
                if (dom.voiceRoomSubtitle) {
                    dom.voiceRoomSubtitle.textContent = "Sélectionnez un salon vocal pour commencer.";
                }
            }

            renderMicMeter(0);
        }

        function stopMicMeter() {
            if (micMeterAnim) {
                cancelAnimationFrame(micMeterAnim);
                micMeterAnim = null;
            }
            if (micMeterSource) {
                micMeterSource.disconnect();
                micMeterSource = null;
            }
            if (micMeterAnalyser) {
                micMeterAnalyser.disconnect();
                micMeterAnalyser = null;
            }
            if (micMeterAudioCtx) {
                micMeterAudioCtx.close().catch(() => { });
                micMeterAudioCtx = null;
            }
            micMeterData = null;
            renderMicMeter(0);
        }

        function startMicMeter(stream) {
            stopMicMeter();

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx || !stream) {
                renderMicMeter(0);
                return;
            }

            try {
                micMeterAudioCtx = new AudioCtx();
                micMeterAnalyser = micMeterAudioCtx.createAnalyser();
                micMeterAnalyser.fftSize = 512;
                micMeterAnalyser.smoothingTimeConstant = 0.82;
                micMeterSource = micMeterAudioCtx.createMediaStreamSource(stream);
                micMeterSource.connect(micMeterAnalyser);
                micMeterData = new Uint8Array(micMeterAnalyser.fftSize);

                const tick = () => {
                    const state = getState();
                    if (!micMeterAnalyser || !micMeterData) return;

                    micMeterAnalyser.getByteTimeDomainData(micMeterData);
                    let sum = 0;
                    for (let i = 0; i < micMeterData.length; i++) {
                        const normalized = (micMeterData[i] - 128) / 128;
                        sum += normalized * normalized;
                    }
                    const rms = Math.sqrt(sum / micMeterData.length);
                    const scaled = Math.min(1, rms * 7.5);

                    if (state.voice.muted || state.voice.deafened || !state.voice.joinedRoomId) {
                        renderMicMeter(0);
                    } else {
                        renderMicMeter(scaled);
                    }

                    micMeterAnim = requestAnimationFrame(tick);
                };

                micMeterAnim = requestAnimationFrame(tick);
            } catch (err) {
                console.error("Mic meter init error", err);
                renderMicMeter(0);
            }
        }

        function renderVoiceMembers() {
            const state = getState();
            dom.voiceMembersList.innerHTML = "";
            const members = Object.values(state.voice.members);
            if (members.length === 0) {
                const li = document.createElement("li");
                li.textContent = "Aucun membre connecté";
                dom.voiceMembersList.appendChild(li);
                return;
            }

            members.sort((a, b) => a.username.localeCompare(b.username, "fr"));
            members.forEach((member) => {
                const li = document.createElement("li");
                li.className = "voice-member-row";

                const userMeta = state.users[member.user_id] || {};
                const colorRaw = typeof userMeta.avatar_color === "number"
                    ? userMeta.avatar_color
                    : deps.hashString(member.username || "u");
                const colorIndex = ((colorRaw % 8) + 8) % 8;

                const avatarHtml = userMeta.avatar_url
                    ? `<img src="${deps.API}${deps.escapeHtml(userMeta.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
                    : deps.escapeHtml((member.username || "U")[0].toUpperCase());

                const badges = [];
                if (member.muted) badges.push('<span class="voice-badge is-danger">Muet</span>');
                if (member.deafened) badges.push('<span class="voice-badge is-danger">Casque</span>');
                if (member.screenSharing) badges.push('<span class="voice-badge is-good">Écran</span>');
                if (badges.length === 0) badges.push('<span class="voice-badge">En ligne</span>');

                li.innerHTML = `
                    <div class="voice-member-main">
                        <div class="voice-member-avatar avatar-bg-${colorIndex}">${avatarHtml}</div>
                        <span class="voice-member-name">${deps.escapeHtml(member.username)}${member.user_id === state.userId ? " (vous)" : ""}</span>
                    </div>
                    <div class="voice-member-badges">${badges.join("")}</div>
                `;
                dom.voiceMembersList.appendChild(li);
            });
        }

        function updateVoiceScreensVisibility() {
            return videoController.updateVoiceScreensVisibility();
        }

        function removeRemoteScreenTile(userId) {
            return videoController.removeRemoteScreenTile(userId);
        }

        function syncRemoteScreenTile(userId, stream) {
            return videoController.syncRemoteScreenTile(userId, stream);
        }

        function applyLocalTrackState() {
            const state = getState();
            if (!state.voice.localStream) return;
            const enabled = !state.voice.muted && !state.voice.deafened;
            state.voice.localStream.getAudioTracks().forEach((track) => {
                track.enabled = enabled;
            });
        }

        function ensureVoiceMember(userId, username) {
            const state = getState();
            if (!state.voice.members[userId]) {
                state.voice.members[userId] = {
                    user_id: userId,
                    username: username || state.users[userId]?.username || "Utilisateur",
                    muted: false,
                    deafened: false,
                    screenSharing: false,
                };
            }
        }

        function cleanupRemotePeer(userId) {
            const state = getState();
            const peer = state.voice.peers[userId];
            if (peer) {
                peer.onicecandidate = null;
                peer.ontrack = null;
                peer.close();
                delete state.voice.peers[userId];
            }

            const audioEl = state.voice.audioEls[userId];
            if (audioEl) {
                audioEl.srcObject = null;
                audioEl.remove();
                delete state.voice.audioEls[userId];
            }

            delete state.voice.remoteStreams[userId];
            delete state.voice.screenSenders[userId];
            removeRemoteScreenTile(userId);
        }

        function resetVoiceConnections() {
            const state = getState();
            Object.keys(state.voice.peers).forEach((userId) => cleanupRemotePeer(userId));
            if (dom.voiceScreensGrid) {
                dom.voiceScreensGrid.innerHTML = "";
            }
            state.voice.remoteScreenEls = {};
            state.voice.remoteStreams = {};
            state.voice.screenSenders = {};
            updateVoiceScreensVisibility();
        }

        function createPeerConnection(remoteUserId, shouldCreateOffer) {
            const state = getState();
            if (state.voice.peers[remoteUserId]) {
                return state.voice.peers[remoteUserId];
            }

            const peer = new RTCPeerConnection(deps.WEBRTC_CONFIG);
            state.voice.peers[remoteUserId] = peer;

            if (state.voice.localStream) {
                state.voice.localStream.getTracks().forEach((track) => {
                    peer.addTrack(track, state.voice.localStream);
                });
            }

            if (state.voice.screenTrack && state.voice.screenStream) {
                const screenSender = peer.addTrack(state.voice.screenTrack, state.voice.screenStream);
                state.voice.screenSenders[remoteUserId] = screenSender;
            }

            peer.onicecandidate = (event) => {
                const localState = getState();
                if (!event.candidate) return;
                deps.wsSend({
                    type: "voice_signal",
                    room_id: localState.voice.joinedRoomId,
                    user_id: localState.userId,
                    target_user_id: remoteUserId,
                    candidate: event.candidate,
                });
            };

            peer.ontrack = (event) => {
                const localState = getState();
                const remoteStream = event.streams[0];
                if (!remoteStream) return;
                localState.voice.remoteStreams[remoteUserId] = remoteStream;

                let audioEl = localState.voice.audioEls[remoteUserId];
                if (!audioEl) {
                    audioEl = document.createElement("audio");
                    audioEl.autoplay = true;
                    audioEl.playsInline = true;
                    document.body.appendChild(audioEl);
                    localState.voice.audioEls[remoteUserId] = audioEl;
                }
                audioEl.srcObject = remoteStream;
                audioEl.muted = localState.voice.deafened;
                audioEl.play().catch(() => { });

                syncRemoteScreenTile(remoteUserId, remoteStream);
                remoteStream.onremovetrack = () => {
                    syncRemoteScreenTile(remoteUserId, remoteStream);
                };
                remoteStream.getVideoTracks().forEach((track) => {
                    track.onended = () => {
                        syncRemoteScreenTile(remoteUserId, remoteStream);
                    };
                });
            };

            if (shouldCreateOffer) {
                peer.createOffer()
                    .then((offer) => peer.setLocalDescription(offer))
                    .then(() => {
                        const localState = getState();
                        deps.wsSend({
                            type: "voice_signal",
                            room_id: localState.voice.joinedRoomId,
                            user_id: localState.userId,
                            target_user_id: remoteUserId,
                            sdp: peer.localDescription,
                        });
                    })
                    .catch((err) => console.error("Failed to create offer", err));
            }

            return peer;
        }

        async function handleVoiceSignal(msg) {
            const state = getState();
            if (msg.target_user_id !== state.userId) return;
            if (!state.voice.joinedRoomId || msg.room_id !== state.voice.joinedRoomId) return;
            if (!msg.user_id) return;

            const remoteUserId = msg.user_id;
            const peer = createPeerConnection(remoteUserId, false);

            if (msg.sdp) {
                await peer.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                if (msg.sdp.type === "offer") {
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    const localState = getState();
                    deps.wsSend({
                        type: "voice_signal",
                        room_id: localState.voice.joinedRoomId,
                        user_id: localState.userId,
                        target_user_id: remoteUserId,
                        sdp: peer.localDescription,
                    });
                }
            } else if (msg.candidate) {
                await peer.addIceCandidate(new RTCIceCandidate(msg.candidate));
            }
        }

        async function renegotiatePeer(remoteUserId) {
            const state = getState();
            const peer = state.voice.peers[remoteUserId];
            if (!peer || !state.voice.joinedRoomId) return;

            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            deps.wsSend({
                type: "voice_signal",
                room_id: state.voice.joinedRoomId,
                user_id: state.userId,
                target_user_id: remoteUserId,
                sdp: peer.localDescription,
            });
        }

        function broadcastVoiceState() {
            const state = getState();
            if (!state.voice.joinedRoomId) return;
            deps.wsSend({
                type: "voice_state",
                room_id: state.voice.joinedRoomId,
                user_id: state.userId,
                username: state.username,
                muted: state.voice.muted,
                deafened: state.voice.deafened,
                screen_sharing: state.voice.screenSharing,
            });
        }

        async function startScreenShare() {
            return videoController.startScreenShare();
        }

        async function stopScreenShare(shouldBroadcast = true, shouldRenegotiate = true) {
            return videoController.stopScreenShare(shouldBroadcast, shouldRenegotiate);
        }

        function handleVoiceWsEvent(msg) {
            const state = getState();
            if (!msg.room_id) return;

            if (msg.type === "voice_join") {
                if (!msg.user_id || !msg.username) return;
                ensureVoiceMember(msg.user_id, msg.username);
                state.voice.members[msg.user_id].muted = !!msg.muted;
                state.voice.members[msg.user_id].deafened = !!msg.deafened;
                state.voice.members[msg.user_id].screenSharing = !!msg.screen_sharing;
                renderVoiceMembers();

                if (
                    state.voice.joinedRoomId &&
                    state.voice.joinedRoomId === msg.room_id &&
                    msg.user_id !== state.userId
                ) {
                    createPeerConnection(msg.user_id, true);
                }
                return;
            }

            if (msg.type === "voice_leave") {
                if (!msg.user_id) return;
                cleanupRemotePeer(msg.user_id);
                delete state.voice.members[msg.user_id];
                renderVoiceMembers();
                return;
            }

            if (msg.type === "voice_state") {
                if (!msg.user_id) return;
                ensureVoiceMember(msg.user_id, msg.username);
                state.voice.members[msg.user_id].muted = !!msg.muted;
                state.voice.members[msg.user_id].deafened = !!msg.deafened;
                state.voice.members[msg.user_id].screenSharing = !!msg.screen_sharing;
                if (!msg.screen_sharing) {
                    removeRemoteScreenTile(msg.user_id);
                } else if (state.voice.remoteStreams[msg.user_id]) {
                    syncRemoteScreenTile(msg.user_id, state.voice.remoteStreams[msg.user_id]);
                }
                renderVoiceMembers();
                return;
            }

            if (msg.type === "voice_signal") {
                handleVoiceSignal(msg).catch((err) => console.error("Voice signal error", err));
            }
        }

        async function joinVoiceRoom() {
            const state = getState();
            if (state.currentRoomKind !== "voice" || !state.currentRoomId) return;
            if (state.voice.joinedRoomId === state.currentRoomId) return;

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Votre navigateur ne supporte pas l'audio WebRTC.");
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                state.voice.localStream = stream;
                state.voice.joinedRoomId = state.currentRoomId;
                state.voice.members = {};
                ensureVoiceMember(state.userId, state.username);
                state.voice.members[state.userId].muted = state.voice.muted;
                state.voice.members[state.userId].deafened = state.voice.deafened;
                state.voice.members[state.userId].screenSharing = state.voice.screenSharing;

                applyLocalTrackState();
                startMicMeter(stream);
                renderVoiceMembers();
                updateVoiceButtons();
                updateVoiceQuickStatus();

                deps.wsSend({
                    type: "voice_join",
                    room_id: state.currentRoomId,
                    user_id: state.userId,
                    username: state.username,
                    muted: state.voice.muted,
                    deafened: state.voice.deafened,
                    screen_sharing: state.voice.screenSharing,
                });
            } catch (err) {
                alert("Impossible d'accéder au micro.");
                console.error(err);
            }
        }

        function leaveVoiceRoom() {
            const state = getState();
            if (!state.voice.joinedRoomId) return;

            stopScreenShare(false, false).catch((err) => console.error("Screen stop error", err));

            deps.wsSend({
                type: "voice_leave",
                room_id: state.voice.joinedRoomId,
                user_id: state.userId,
                username: state.username,
            });

            resetVoiceConnections();
            if (state.voice.localStream) {
                state.voice.localStream.getTracks().forEach((track) => track.stop());
            }
            stopMicMeter();

            state.voice.joinedRoomId = null;
            state.voice.localStream = null;
            state.voice.members = {};
            renderVoiceMembers();
            updateVoiceButtons();
            updateVoiceQuickStatus();
        }

        function toggleVoiceMute() {
            const state = getState();
            if (!state.voice.joinedRoomId) return;
            state.voice.muted = !state.voice.muted;
            applyLocalTrackState();
            ensureVoiceMember(state.userId, state.username);
            state.voice.members[state.userId].muted = state.voice.muted;
            renderVoiceMembers();
            updateVoiceButtons();
            updateVoiceQuickStatus();

            broadcastVoiceState();
        }

        function toggleVoiceDeafen() {
            const state = getState();
            if (!state.voice.joinedRoomId) return;
            state.voice.deafened = !state.voice.deafened;
            applyLocalTrackState();

            Object.values(state.voice.audioEls).forEach((audioEl) => {
                audioEl.muted = state.voice.deafened;
            });

            ensureVoiceMember(state.userId, state.username);
            state.voice.members[state.userId].deafened = state.voice.deafened;
            renderVoiceMembers();
            updateVoiceButtons();
            updateVoiceQuickStatus();

            broadcastVoiceState();
        }

        function toggleVoiceScreenShare() {
            return videoController.toggleVoiceScreenShare();
        }

        return {
            getScreenQualityPreset,
            getScreenCaptureConstraints,
            getScreenTrackConstraints,
            applyScreenTrackConstraints,
            syncScreenShareSettingsUI,
            updateScreenShareSettingsFromUI,
            handleScreenSettingsChange,
            getScreenProfileLabel,
            updateVoiceButtons,
            renderMicMeter,
            updateVoiceQuickStatus,
            stopMicMeter,
            startMicMeter,
            renderVoiceMembers,
            updateVoiceScreensVisibility,
            removeRemoteScreenTile,
            syncRemoteScreenTile,
            applyLocalTrackState,
            ensureVoiceMember,
            cleanupRemotePeer,
            resetVoiceConnections,
            createPeerConnection,
            handleVoiceSignal,
            renegotiatePeer,
            broadcastVoiceState,
            startScreenShare,
            stopScreenShare,
            handleVoiceWsEvent,
            joinVoiceRoom,
            leaveVoiceRoom,
            toggleVoiceMute,
            toggleVoiceDeafen,
            toggleVoiceScreenShare,
        };
    }

    return {
        createVoiceState,
        createVoiceController,
    };
})();
