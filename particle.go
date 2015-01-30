package main

import (
	"gopkg.in/mgo.v2"
	"gopkg.in/mgo.v2/bson"
	"log"
	"time"
)

// Reserved parameter keys
// All other keys are put into particle.Data
const (
	paramPrefix    = "_ttyn"
	paramRequestId = paramPrefix + "Request"
	paramBeamId    = paramPrefix + "Beam"
	paramEvent     = paramPrefix + "Event"
	paramDomain    = paramPrefix + "Domain"
	paramPath      = paramPrefix + "Path"
)

const (
	particleCollection = "particles"
)

type particle struct {
	Id         bson.ObjectId     `bson:"_id"`
	BeamId     string            `bson:"beam_id"`
	Identifier string            `bson:"identifier"`
	Timestamp  int64             `bson:"timestamp"`
	Event      string            `bson:"event"`
	Domain     string            `bson:"domain"`
	Path       string            `bson:"path"`
	Data       map[string]string `bson:"data"`
}

// Init Particle
func (p *particle) Init(params map[string]string) {
	p.Id = bson.NewObjectId()
	p.Timestamp = time.Now().UTC().Unix()

	var ok bool

	if _, ok = params[paramRequestId]; !ok {
		log.Println("Particle missing key: " + paramRequestId)
		return
	}
	delete(params, paramRequestId)

	if _, ok = params[paramBeamId]; !ok {
		log.Println("Particle missing key: " + paramBeamId)
		return
	}
	p.BeamId = params[paramBeamId]
	p.Identifier = params[paramBeamId]
	delete(params, paramBeamId)

	if _, ok = params[paramEvent]; !ok {
		log.Println("Particle missing key: " + paramEvent)
		return
	}
	p.Event = params[paramEvent]
	delete(params, paramEvent)

	if _, ok = params[paramDomain]; !ok {
		log.Println("Particle missing key: " + paramDomain)
		return
	}
	p.Domain = params[paramDomain]
	delete(params, paramDomain)

	if _, ok = params[paramPath]; !ok {
		log.Println("Particle missing key: " + paramPath)
		return
	}
	p.Path = params[paramPath]
	delete(params, paramPath)

	// We can set the rest of the parameters to just be in Data
	p.Data = params
}

// Save Particle
func (p *particle) Save(session *mgo.Session, config *TetryonConfig) {
	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	collection := sessionCopy.DB(config.MongoConfig.Database).C(particleCollection)

	err := collection.Insert(p)
	if err != nil {
		log.Println(err)
	} else {
		// log.Println("Saved new particle: " + p.Id.String())
	}
}

/**
 * Split an encoded request ID into the ID, part ( of chunks ), and total ( chunks )
 * @param  {string} requestId
 * @return {string} The ID of the request.
 * @return {int} The part of the chunks.
 * @return {int} The total number of chunks expected.
 * @return {error} An error if not successful.
 */
/*
func splitRequestId(requestId string) (string, int, int, error) {
	a := strings.Split(requestId, ":")
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
*/
