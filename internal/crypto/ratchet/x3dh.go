package ratchet

import "errors"

// X3DHHandshake describes the inputs required to establish a shared secret.
type X3DHHandshake struct {
	IdentityKey    []byte // Curve25519
	SignedPreKey   []byte
	OneTimePreKey  []byte
	Signature      []byte // Ed25519 signature for SignedPreKey
	PeerIdentity   []byte
	PeerPreKey     []byte
	PeerOneTimeKey []byte
}

// PerformX3DH currently returns a placeholder error; wire up a real library such as github.com/otrv4/axolotl in future iterations.
func PerformX3DH(hs X3DHHandshake) ([]byte, error) {
	return nil, errors.New("X3DH handshake is not implemented yet")
}
