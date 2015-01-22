package main

import (
	"log"
	"strconv"
	"strings"
)

type request struct {
	Id            string
	Type          string
	Parameters    map[string]string
	ReceivedParts map[int]bool
}

const prefixKey = "_ttyn"
const keyId = prefixKey + "Request"

func (req *request) Init(reqType string, reqParams map[string]string) {
	id, _, total, err := splitRequestId(reqParams[keyId])

	if err != nil {
		log.Fatal(err)
	}

	req.Id = id
	req.Type = reqType
	req.ReceivedParts = make(map[int]bool)
	req.Parameters = make(map[string]string)

	for i := 1; i <= total; i++ {
		req.ReceivedParts[i] = false
	}

	req.AddParams(reqParams)
}

func (req *request) AddParams(parameters map[string]string) {
	_, part, _, _ := splitRequestId(parameters[keyId])

	req.ReceivedParts[part] = true

	for key, value := range parameters {
		req.Parameters[key] = value
	}
}

func (req *request) ReceivedAllParts() bool {
	for _, received := range req.ReceivedParts {
		if !received {
			return false
		}
	}
	return true
}

// Encoded IDs are in the format:
// [id]:[part]-[total]
// [id] identifies the request uniquely
// [part] is the chunk out of the total expected
// [total] is the number of chunks expected
func splitRequestId(encodedId string) (string, int, int, error) {
	a := strings.Split(encodedId, ":")
	b := strings.Split(a[1], "-")

	id := a[0]

	var err error
	var part int64
	var total int64

	part, err = strconv.ParseInt(b[0], 10, 32)

	if err != nil {
		return "", 0, 0, err
	}

	total, err = strconv.ParseInt(b[1], 10, 32)

	if err != nil {
		return "", 0, 0, err
	}

	return id, int(part), int(total), nil
}
