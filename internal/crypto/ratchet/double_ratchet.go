package ratchet

import "errors"

// Session represents envelope for Double Ratchet state.
type Session struct {
	RootKey   []byte
	SendChain []byte
	RecvChain []byte
}

// Encrypt is a placeholder for Double Ratchet encryption.
func (s *Session) Encrypt(plaintext []byte, associatedData []byte) ([]byte, error) {
	return nil, errors.New("double ratchet encryption not implemented")
}

// Decrypt is a placeholder for Double Ratchet decryption.
func (s *Session) Decrypt(ciphertext []byte, associatedData []byte) ([]byte, error) {
	return nil, errors.New("double ratchet decryption not implemented")
}
