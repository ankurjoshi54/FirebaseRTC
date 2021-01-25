mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

const configuration = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
            ],
        },
    ],
    iceCandidatePoolSize: 10,
};

let peerConnection = null;
let localStream = null;
let localScreen = null;
let remoteStream = null;
let remoteScreen = null;
let roomDialog = null;
let roomId = null;

function init() {
    document.querySelector('#cameraBtn').addEventListener('click', openUserMedia);
    document.querySelector('#hangupBtn').addEventListener('click', hangUp);
    document.querySelector('#createBtn').addEventListener('click', createRoom);
    document.querySelector('#joinBtn').addEventListener('click', joinRoom);
    roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));
}

async function createRoom() {
    document.querySelector('#createBtn').disabled = true;
    document.querySelector('#joinBtn').disabled = true;
    const db = firebase.firestore();
    const roomRef = await db.collection('rooms').doc();

    console.log('Create PeerConnection with configuration: ', configuration);
    // peerConnection = new RTCPeerConnection(configuration);
    peerConnection = new SimplePeer({ initiator: true, config: configuration, trickle: false });

    registerPeerConnectionListeners();

    // localStream.getTracks().forEach(track => {
    //     peerConnection.addTrack(track, localStream);
    // });
    // localScreen.getTracks().forEach(track => {
    //     peerConnection.addTrack(track, localScreen);
    // });

    // Code for collecting ICE candidates below
    const callerCandidatesCollection = roomRef.collection('callerCandidates');

    // peerConnection.addEventListener('icecandidate', event => {
    //     if (!event.candidate) {
    //         console.log('Got final candidate!');
    //         return;
    //     }
    //     console.log('Got candidate: ', event.candidate);
    //     callerCandidatesCollection.add(event.candidate.toJSON());
    // });
    peerConnection.on('signal', data => {
        console.log(data);
        if (data && data.candidate) {
            if (data.transceiverRequest && data.transceiverRequest.init == undefined) {
                data.transceiverRequest.init = null;
            }
            console.log('Got candidate: ', data.candidate);
            callerCandidatesCollection.add(data);
        }
    });
    // Code for collecting ICE candidates above

    // Code for creating a room below
    peerConnection.on('signal', async data => {
        // console.log(data);
        if (data && data.sdp) {
            if (data.transceiverRequest && data.transceiverRequest.init == undefined) {
                data.transceiverRequest.init = null;
            }
            // peerConnection.signal(data);
            console.log('Created offer:', data);

            const roomWithOffer = {
                'offer': {
                    type: data.type,
                    sdp: data,
                },
            };
            await roomRef.set(roomWithOffer);
            roomId = roomRef.id;
            console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
            document.querySelector(
                '#currentRoom').innerText = `Current room is ${roomRef.id} - You are the caller!`;
        }
    });

    // const offer = await peerConnection.createOffer();
    // await peerConnection.setLocalDescription(offer);
    // console.log('Created offer:', offer);
    //
    // const roomWithOffer = {
    //     'offer': {
    //         type: offer.type,
    //         sdp: offer.sdp,
    //     },
    // };
    // await roomRef.set(roomWithOffer);
    // roomId = roomRef.id;
    // console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
    // document.querySelector(
    //     '#currentRoom').innerText = `Current room is ${roomRef.id} - You are the caller!`;
    // Code for creating a room above

    peerConnection.on('track', (track, stream) => {
        console.log('Got events:', stream);
        console.log(track, stream);
        console.log('Got remote track:', track);
        const tracks = [];
        stream.getTracks().forEach(track => {
            console.log('Add a track to the remoteStream:', track);
            tracks.push(track);
            remoteStream.addTrack(track);
        });
        if (tracks.length > 1) {
            tracks.forEach(track => remoteStream.addTrack(track));
        } else {
            tracks.forEach(track => remoteScreen.addTrack(track));
        }
    });
    // peerConnection.addEventListener('track', event => {
    //     console.log('Got events:', event.streams);
    //     console.log(event);
    //     console.log('Got remote track:', event.streams[0]);
    //     const tracks = [];
    //     event.streams[0].getTracks().forEach(track => {
    //         console.log('Add a track to the remoteStream:', track);
    //         tracks.push(track);
    //         remoteStream.addTrack(track);
    //     });
    //     if (tracks.length > 1) {
    //         tracks.forEach(track => remoteStream.addTrack(track));
    //     } else {
    //         tracks.forEach(track => remoteScreen.addTrack(track));
    //     }
    // });

    // Listening for remote session description below
    roomRef.onSnapshot(async snapshot => {
        const data = snapshot.data();
        if (!peerConnection.currentRemoteDescription && data && data.answer) {
            console.log('Got remote description: ', data.answer);
            peerConnection.signal(data.answer.sdp);
            // const rtcSessionDescription = new RTCSessionDescription(data.answer);
            // await peerConnection.setRemoteDescription(rtcSessionDescription);
        }
    });
    // Listening for remote session description above

    // Listen for remote ICE candidates below
    roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
                let data = change.doc.data();
                console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
                peerConnection.signal(data);
                // await peerConnection.addIceCandidate(new RTCIceCandidate(data));
            }
        });
    });
    // Listen for remote ICE candidates above
}

function joinRoom() {
    document.querySelector('#createBtn').disabled = true;
    document.querySelector('#joinBtn').disabled = true;

    document.querySelector('#confirmJoinBtn').
    addEventListener('click', async () => {
        roomId = document.querySelector('#room-id').value;
        console.log('Join room: ', roomId);
        document.querySelector(
            '#currentRoom').innerText = `Current room is ${roomId} - You are the callee!`;
        await joinRoomById(roomId);
    }, {once: true});
    roomDialog.open();
}

async function joinRoomById(roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(`${roomId}`);
    const roomSnapshot = await roomRef.get();
    console.log('Got room:', roomSnapshot.exists);

    if (roomSnapshot.exists) {
        console.log('Create PeerConnection with configuration: ', configuration);
        // peerConnection = new RTCPeerConnection(configuration);
        peerConnection = new SimplePeer({ config: configuration, trickle: false });

        registerPeerConnectionListeners();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        localScreen.getTracks().forEach(track => {
            peerConnection.addTrack(track, localScreen);
        });

        // Code for collecting ICE candidates below
        const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
        // peerConnection.addEventListener('icecandidate', event => {
        //     if (!event.candidate) {
        //         console.log('Got final candidate!');
        //         return;
        //     }
        //     console.log('Got candidate: ', event.candidate);
        //     calleeCandidatesCollection.add(event.candidate.toJSON());
        // });

        peerConnection.on('signal', data => {
            console.log(data);
            console.log('Inside first signal with value: ', data);
            if (data && data.candidate) {
                if (data.transceiverRequest && data.transceiverRequest.init == undefined) {
                    data.transceiverRequest.init = null;
                }

                console.log('Got candidate: ', data.candidate);
                calleeCandidatesCollection.add(data);
            }
        });
        // Code for collecting ICE candidates above

        peerConnection.on('track', (track, stream) => {
            console.log('Got events:', stream);
            console.log(track, stream);
            console.log('Got remote track:', track);
            const tracks = [];
            stream.getTracks().forEach(track => {
                console.log('Add a track to the remoteStream:', track);
                tracks.push(track);
                remoteStream.addTrack(track);
            });
            if (tracks.length > 1) {
                tracks.forEach(track => remoteStream.addTrack(track));
            } else {
                tracks.forEach(track => remoteScreen.addTrack(track));
            }
        });

        // peerConnection.addEventListener('track', event => {
        //     console.log('Got events:', event.streams);
        //     console.log(event);
        //     console.log('Got remote track:', event.streams[0]);
        //     const tracks = [];
        //     event.streams[0].getTracks().forEach(track => {
        //         console.log('Add a track to the remoteStream:', track);
        //         tracks.push(track);
        //         remoteStream.addTrack(track);
        //     });
        //     console.log(tracks);
        //     if (tracks.length > 1) {
        //         tracks.forEach(track => remoteStream.addTrack(track));
        //     } else {
        //         tracks.forEach(track => remoteScreen.addTrack(track));
        //     }
        // });

        // Code for setting SDP offer
        const offer = roomSnapshot.data().offer;
        console.log('Got offer:', offer);
        peerConnection.signal(offer.sdp);
        // End of the Code for setting SDP offer

        // Code for creating SDP answer below
        peerConnection.on('signal', async data => {
            // console.log(data);
            console.log('Inside second signal with value: ', data);
            if (data && data.sdp) {
                if (data.transceiverRequest && data.transceiverRequest.init == undefined) {
                    data.transceiverRequest.init = null;
                }
                // peerConnection.signal(data);
                console.log('Created answer:', data);

                const roomWithAnswer = {
                    answer: {
                        type: data.type,
                        sdp: data,
                    },
                };
                await roomRef.update(roomWithAnswer);

                // Listening for remote ICE candidates below
                roomRef.collection('callerCandidates').onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(async change => {
                        if (change.type === 'added') {
                            let data = change.doc.data();
                            console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
                            console.log(`${typeof(data)} is the type of remove ice candidate.`);
                            peerConnection.signal(data);
                            // await peerConnection.addIceCandidate(new RTCIceCandidate(data));
                        }
                    });
                });
                // Listening for remote ICE candidates above
            }
        });

        // const offer = roomSnapshot.data().offer;
        // console.log('Got offer:', offer);
        // await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        // const answer = await peerConnection.createAnswer();
        // console.log('Created answer:', answer);
        // await peerConnection.setLocalDescription(answer);
        //
        // const roomWithAnswer = {
        //     answer: {
        //         type: answer.type,
        //         sdp: answer.sdp,
        //     },
        // };
        // await roomRef.update(roomWithAnswer);
        // Code for creating SDP answer above
    }
}

async function openUserMedia(e) {
    const stream = await navigator.mediaDevices.getUserMedia(
        {video: true, audio: true});
    document.querySelector('#localVideo').srcObject = stream;
    localStream = stream;
    remoteStream = new MediaStream();
    document.querySelector('#remoteVideo').srcObject = remoteStream;

    const screen = await navigator.mediaDevices.getDisplayMedia({video: true, audio: false});
    document.querySelector('#localScreen').srcObject = screen;
    localScreen = screen;
    remoteScreen = new MediaStream();
    document.querySelector('#remoteScreen').srcObject = remoteScreen;

    console.log('Stream:', document.querySelector('#localVideo').srcObject);
    console.log('Screen:', document.querySelector('#localScreen').srcObject);
    document.querySelector('#cameraBtn').disabled = true;
    document.querySelector('#joinBtn').disabled = false;
    document.querySelector('#createBtn').disabled = false;
    document.querySelector('#hangupBtn').disabled = false;
}

async function hangUp(e) {
    const tracks = document.querySelector('#localVideo').srcObject.getTracks();
    tracks.forEach(track => {
        track.stop();
    });

    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
    }

    if (peerConnection) {
        peerConnection.destroy();
    }

    document.querySelector('#localVideo').srcObject = null;
    document.querySelector('#remoteVideo').srcObject = null;
    document.querySelector('#cameraBtn').disabled = false;
    document.querySelector('#joinBtn').disabled = true;
    document.querySelector('#createBtn').disabled = true;
    document.querySelector('#hangupBtn').disabled = true;
    document.querySelector('#currentRoom').innerText = '';

    // Delete room on hangup
    if (roomId) {
        const db = firebase.firestore();
        const roomRef = db.collection('rooms').doc(roomId);
        const calleeCandidates = await roomRef.collection('calleeCandidates').get();
        calleeCandidates.forEach(async candidate => {
            await candidate.ref.delete();
        });
        const callerCandidates = await roomRef.collection('callerCandidates').get();
        callerCandidates.forEach(async candidate => {
            await candidate.ref.delete();
        });
        await roomRef.delete();
    }

    document.location.reload(true);
}

function registerPeerConnectionListeners() {
    // peerConnection.addEventListener('icegatheringstatechange', () => {
    //     console.log(
    //         `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
    // });
    //
    // peerConnection.addEventListener('connectionstatechange', () => {
    //     console.log(`Connection state change: ${peerConnection.connectionState}`);
    // });
    //
    // peerConnection.addEventListener('signalingstatechange', () => {
    //     console.log(`Signaling state change: ${peerConnection.signalingState}`);
    // });
    //
    // peerConnection.addEventListener('iceconnectionstatechange ', () => {
    //     console.log(
    //         `ICE connection state change: ${peerConnection.iceConnectionState}`);
    // });

    peerConnection.on('connect', () => {
        console.log('Peer connection is ready to use');
    });

    peerConnection.on('stream', (event) => {
        console.log('Peer connection got stream ', event);
    });

    peerConnection.on('track', (event, stream) => {
        // console.log('Peer connection got track ', event, stream);
    });

    peerConnection.on('error', (event) => {
        console.log('Peer connection got error ', event);
    });

    peerConnection.on('close', () => {
        console.log('Peer connection got closed ');
    });
}

init();
