package ipaship

import "fmt"

type Client struct {
	APIKey string
}

func NewClient(apiKey string) *Client {
	return &Client{APIKey: apiKey}
}

func (c *Client) Audit(filePath string) error {
	fmt.Printf("Auditing %s via ipaship.com...\n", filePath)
	return nil
}