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

func (r *request) Init(reqType string, reqParams map[string]string) {
	id, _, total, err := splitRequestId(reqParams[keyId])

	if err != nil {
		log.Fatal(err)
	}

	r.Id = id
	r.Type = reqType
	r.ReceivedParts = make(map[int]bool)
	r.Parameters = make(map[string]string)

	for i := 1; i <= total; i++ {
		r.ReceivedParts[i] = false
	}

	r.AddParams(reqParams)
}

func (r *request) AddParams(parameters map[string]string) {
	_, part, _, _ := splitRequestId(parameters[keyId])

	r.ReceivedParts[part] = true

	for key, value := range parameters {
		r.Parameters[key] = value
	}
}

func (r *request) ReceivedAllParts() bool {
	for _, received := range r.ReceivedParts {
		if !received {
			return false
		}
	}
	return true
}

/**
 * Split an encoded request ID into the ID, part ( of chunks ), and total ( chunks )
 * Encoded ID format: [id]:[part]-[total]
 * @param  {string} requestId
 * @return {string} The ID of the request.
 * @return {int} The part of the chunks.
 * @return {int} The total number of chunks expected.
 * @return {error} An error if not successful.
 */
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
